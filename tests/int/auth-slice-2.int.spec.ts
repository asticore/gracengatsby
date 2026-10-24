// @vitest-environment node
// Auth slice 2: shared (D1) rate limits with memory fallback, verification tokens and
// cooldown, the verified-to-sign-in setting, and the admin "mark verified" service.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { hit, hitShared, peekShared, resetRateLimiter } from '@/features/security/rateLimit'
import { emailVerificationFrom, DEFAULT_EMAIL_VERIFICATION_SETTINGS } from '@/features/security/settings'
import { markAccountEmailVerified } from '@/features/security/emailVerificationAdmin'

const sent = vi.hoisted(() => [] as Array<{ to: string; url: string }>)
const store = vi.hoisted(() => ({
  rows: [] as Array<{ userId: number; email: string; tokenHash: string; createdAt: string; expiresAt: string; usedAt: string | null }>,
}))

vi.mock('@/features/accounts/emails', () => ({
  sendVerifyEmail: async (to: string, url: string) => {
    sent.push({ to, url })
    return { ok: true }
  },
  sendWelcomeEmail: async () => ({ ok: true }),
  sendResetEmail: async () => ({ ok: true }),
  sendAlreadyRegisteredEmail: async () => ({ ok: true }),
}))

// In-memory stand-in for the D1-backed token store, with the same contract.
vi.mock('@/features/security/emailVerificationStore', () => ({
  storeVerificationToken: async (userId: number, email: string, tokenHash: string, expiresAt: string): Promise<void> => {
    const now = new Date().toISOString()
    for (const row of store.rows) if (row.userId === userId && !row.usedAt) row.usedAt = now
    store.rows.push({ userId, email, tokenHash, createdAt: now, expiresAt, usedAt: null })
  },
  consumeVerificationToken: async (tokenHash: string) => {
    const row = store.rows.find((r) => r.tokenHash === tokenHash && !r.usedAt && r.expiresAt > new Date().toISOString())
    if (!row) return null
    row.usedAt = new Date().toISOString()
    return { userId: row.userId, email: row.email }
  },
  latestVerificationSentAt: async (userId: number): Promise<string | null> => {
    const mine = store.rows.filter((r) => r.userId === userId).map((r) => r.createdAt).sort()
    return mine[mine.length - 1] ?? null
  },
  voidVerificationTokens: async (userId: number): Promise<void> => {
    for (const row of store.rows) if (row.userId === userId) row.usedAt = row.usedAt ?? 'x'
  },
}))

import { completeVerification, issueVerification, registerCustomer, resendVerification, signIn } from '@/features/accounts/auth'

type Row = Record<string, unknown> & { id: number }

const makeEngine = (security: Record<string, unknown>) => {
  const users: Row[] = []
  let next = 1
  return {
    users,
    findGlobal: async ({ slug }: { slug: string }) =>
      slug === 'security-settings' ? security : { accountSettings: { requireEmailVerification: false } },
    find: async ({ where }: { where: Record<string, { equals: unknown }> }) => {
      const [[field, cond]] = Object.entries(where)
      return { docs: users.filter((u) => u[field] === cond.equals) }
    },
    findByID: async ({ id }: { id: number }) => users.find((u) => u.id === id),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: next++, ...data } as Row
      users.push(row)
      return row
    },
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const row = users.find((u) => u.id === id)
      Object.assign(row as Row, data)
      return row
    },
    login: async ({ data }: { data: { email: string; password: string } }) => {
      const user = users.find((u) => u.email === data.email && u.password === data.password)
      if (!user) throw new Error('bad credentials')
      return { token: `tok-${user.id}`, user }
    },
  }
}

const urls = { signIn: '/s', forgotPassword: '/f', account: '/a' }
const urlFor = (token: string) => `https://x.test/account/verify-email?token=${token}`
const lastToken = () => new URL(sent[sent.length - 1].url).searchParams.get('token') as string

describe('shared rate limits', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy>>

  beforeAll(async () => {
    proxy = await getPlatformProxy()
    await (proxy.env as { D1: D1Database }).D1.prepare(
      'CREATE TABLE IF NOT EXISTS `eg_rate_limits` (`key` text NOT NULL, `window_start` integer NOT NULL, `count` integer DEFAULT 0 NOT NULL, `expires_at` integer NOT NULL, PRIMARY KEY(`key`, `window_start`))',
    ).run()
  })
  afterAll(async () => {
    await (proxy.env as { D1: D1Database }).D1.prepare("DELETE FROM `eg_rate_limits` WHERE key LIKE 'spec:%'").run()
    await proxy.dispose()
  })
  beforeEach(() => resetRateLimiter())

  it('counts in D1 and limits once the count passes the limit', async () => {
    const d1 = (proxy.env as { D1: D1Database }).D1 as never
    const now = 1_700_000_000_000
    const decisions = []
    for (let i = 0; i < 4; i++) decisions.push(await hitShared('spec:basic', 3, { d1, now, purgeChance: 0 }))
    expect(decisions.map((d) => d.limited)).toEqual([false, false, false, true])
    expect(decisions[3].count).toBe(4)
    expect(await peekShared('spec:basic', { d1, now })).toBe(4)
  })

  it('shares the count across isolates (nothing is held in memory)', async () => {
    const d1 = (proxy.env as { D1: D1Database }).D1 as never
    const now = 1_700_000_100_000
    await hitShared('spec:shared', 2, { d1, now, purgeChance: 0 })
    resetRateLimiter() // a "different isolate" has an empty map
    await hitShared('spec:shared', 2, { d1, now, purgeChance: 0 })
    resetRateLimiter()
    expect((await hitShared('spec:shared', 2, { d1, now, purgeChance: 0 })).limited).toBe(true)
  })

  it('starts a fresh count in the next window and reports retry-after', async () => {
    const d1 = (proxy.env as { D1: D1Database }).D1 as never
    const start = 1_700_000_200_000 - (1_700_000_200_000 % 60_000)
    await hitShared('spec:window', 1, { d1, now: start + 1000, purgeChance: 0 })
    const blocked = await hitShared('spec:window', 1, { d1, now: start + 1000, purgeChance: 0 })
    expect(blocked.limited).toBe(true)
    expect(blocked.retryAfterSeconds).toBe(59)
    const next = await hitShared('spec:window', 1, { d1, now: start + 61_000, purgeChance: 0 })
    expect(next.limited).toBe(false)
    expect(next.count).toBe(1)
  })

  it('purges ended windows', async () => {
    const d1 = (proxy.env as { D1: D1Database }).D1 as never
    const now = 1_700_000_300_000
    await hitShared('spec:old', 5, { d1, now, purgeChance: 0 })
    await hitShared('spec:trigger', 5, { d1, now: now + 10 * 60_000, purgeChance: 1 })
    const row = await (proxy.env as { D1: D1Database }).D1.prepare("SELECT COUNT(*) AS n FROM eg_rate_limits WHERE key = 'spec:old'").first<{ n: number }>()
    expect(row?.n).toBe(0)
  })

  it('falls back to the in-memory counter when there is no D1 or it throws', async () => {
    const now = 1_700_000_400_000
    const a = await hitShared('spec:mem', 1, { d1: null, now })
    const b = await hitShared('spec:mem', 1, { d1: null, now })
    expect([a.limited, b.limited]).toEqual([false, true])

    const broken = { prepare: () => { throw new Error('d1 down') } } as never
    resetRateLimiter()
    const c = await hitShared('spec:broken', 1, { d1: broken, now })
    const d = await hitShared('spec:broken', 1, { d1: broken, now })
    expect([c.limited, d.limited]).toEqual([false, true])
    expect(await peekShared('spec:broken', { d1: broken, now })).toBe(2)
    expect(hit('spec:direct', 1, now).limited).toBe(false)
  })
})

describe('email verification with the token table', () => {
  beforeEach(() => {
    sent.length = 0
    store.rows.length = 0
  })

  it('stores only a hash, spends the link once, and marks the account verified', async () => {
    const engine = makeEngine({ emailVerificationRequired: true })
    const outcome = await registerCustomer(engine as never, 'a@x.test', 'password1', urls, urlFor)
    expect(outcome.created).toBe(true)
    expect(store.rows).toHaveLength(1)
    expect(store.rows[0].tokenHash).not.toContain(lastToken())
    expect(engine.users[0].emailVerifyTokenHash).toBeUndefined()

    expect((await completeVerification(engine as never, lastToken())).ok).toBe(true)
    expect(engine.users[0].emailVerifiedAt).toBeTruthy()
    expect((await completeVerification(engine as never, lastToken())).ok).toBe(false)
  })

  it('a newer email supersedes the older link', async () => {
    const engine = makeEngine({})
    const user = await engine.create({ data: { email: 'b@x.test', password: 'password1', roles: ['customer'] } })
    await issueVerification(engine as never, user.id, 'b@x.test', urlFor)
    const first = lastToken()
    await issueVerification(engine as never, user.id, 'b@x.test', urlFor)
    expect((await completeVerification(engine as never, first)).ok).toBe(false)
    expect((await completeVerification(engine as never, lastToken())).ok).toBe(true)
  })

  it('holds back a resend inside the cooldown and allows it after', async () => {
    const engine = makeEngine({ emailVerificationRequired: true, emailVerificationCooldownSeconds: 60 })
    await registerCustomer(engine as never, 'c@x.test', 'password1', urls, urlFor)
    expect(sent).toHaveLength(1)

    await resendVerification(engine as never, 'c@x.test', urlFor)
    expect(sent).toHaveLength(1)

    store.rows[0].createdAt = new Date(Date.now() - 61_000).toISOString()
    await resendVerification(engine as never, 'c@x.test', urlFor)
    expect(sent).toHaveLength(2)
  })

  it('cooldown 0 never holds a resend back', async () => {
    const engine = makeEngine({ emailVerificationRequired: true, emailVerificationCooldownSeconds: 0 })
    await registerCustomer(engine as never, 'd@x.test', 'password1', urls, urlFor)
    await resendVerification(engine as never, 'd@x.test', urlFor)
    expect(sent).toHaveLength(2)
  })

  it('the Security setting holds back unverified customers; off by default', async () => {
    const off = makeEngine({})
    await off.create({ data: { email: 'e@x.test', password: 'password1', roles: ['customer'] } })
    expect((await signIn(off as never, 'e@x.test', 'password1')).ok).toBe(true)

    const on = makeEngine({ emailVerificationRequired: true })
    await on.create({ data: { email: 'f@x.test', password: 'password1', roles: ['customer'] } })
    await on.create({ data: { email: 'g@x.test', password: 'password1', roles: ['admin'] } })
    const blocked = await signIn(on as never, 'f@x.test', 'password1')
    expect(blocked.ok).toBe(false)
    expect(blocked.needsVerification).toBe(true)
    expect((await signIn(on as never, 'g@x.test', 'password1')).ok).toBe(true)

    on.users[0].emailVerifiedAt = new Date().toISOString()
    expect((await signIn(on as never, 'f@x.test', 'password1')).ok).toBe(true)
  })
})

describe('email verification settings and admin action', () => {
  it('defaults are off and 60 seconds, and the cooldown is clamped', () => {
    expect(DEFAULT_EMAIL_VERIFICATION_SETTINGS).toEqual({ requireToSignIn: false, resendCooldownSeconds: 60 })
    expect(emailVerificationFrom(() => undefined)).toEqual(DEFAULT_EMAIL_VERIFICATION_SETTINGS)
    expect(emailVerificationFrom((k) => ({ email_verification_required: 1, email_verification_cooldown_seconds: 99999 })[k as string])).toEqual({
      requireToSignIn: true,
      resendCooldownSeconds: 3600,
    })
    expect(emailVerificationFrom((k) => ({ email_verification_cooldown_seconds: 0 })[k as string]).resendCooldownSeconds).toBe(0)
  })

  const deps = (account: { id: number; emailVerifiedAt?: string | null } | null) => {
    const calls: string[] = []
    return {
      calls,
      deps: {
        findAccount: async () => account,
        setVerified: async (id: number): Promise<void> => void calls.push(`set:${id}`),
        voidTokens: async (id: number): Promise<void> => void calls.push(`void:${id}`),
        record: async (detail: string): Promise<void> => void calls.push(`audit:${detail}`),
      },
    }
  }

  it('only an administrator can mark an account verified, and it is audited', async () => {
    const d = deps({ id: 7 })
    expect((await markAccountEmailVerified(d.deps, null, 'a@x.test')).ok).toBe(false)
    expect((await markAccountEmailVerified(d.deps, { id: 1, roles: ['editor'] }, 'a@x.test')).ok).toBe(false)
    expect(d.calls).toEqual([])

    const ok = await markAccountEmailVerified(d.deps, { id: 1, email: 'admin@x.test', roles: ['admin'] }, ' A@x.test ')
    expect(ok.ok).toBe(true)
    expect(d.calls).toEqual(['set:7', 'void:7', 'audit:marked verified by admin@x.test'])
  })

  it('reports unknown and already verified accounts without writing', async () => {
    const admin = { id: 1, roles: ['admin'] }
    const none = deps(null)
    expect((await markAccountEmailVerified(none.deps, admin, 'a@x.test')).ok).toBe(false)
    const done = deps({ id: 3, emailVerifiedAt: '2026-01-01T00:00:00.000Z' })
    expect((await markAccountEmailVerified(done.deps, admin, 'a@x.test')).message).toMatch(/already/)
    expect(none.calls.concat(done.calls)).toEqual([])
  })
})
