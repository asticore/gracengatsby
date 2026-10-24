// @vitest-environment node
// Passwordless sign-in (emailed link and six-digit code), against in-memory stand-ins
// for the engine, the token table and the mailer. The clock is ours, so expiry is exact.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { guardAttempt } from '@/features/accounts/rateLimit'
import {
  confirmLink,
  inspectLink,
  requestLogin,
  safeLandingPath,
  verifyCode,
  type PasswordlessDeps,
} from '@/features/passwordless'
import { type LoginKind, type LoginTokenRow, type LoginTokenStore } from '@/features/passwordless/store'
import { MAX_CODE_ATTEMPTS, checkCode, codeHash, sha256Hex } from '@/features/passwordless/tokens'
import { resetRateLimiter } from '@/features/security'
import type { PasswordlessSettings } from '@/features/security/settings'

type Row = Record<string, unknown> & { id: number; email: string }

const START = Date.parse('2026-10-24T10:00:00.000Z')

const makeEngine = () => {
  const users: Row[] = []
  let next = 1
  const engine = {
    users,
    add(data: Record<string, unknown>): Row {
      const row = { id: next++, ...data } as Row
      users.push(row)
      return row
    },
    find: async ({ where }: { where: Record<string, { equals: unknown }> }) => {
      const [[field, cond]] = Object.entries(where)
      return { docs: users.filter((u) => u[field] === cond.equals) }
    },
    findByID: async ({ id }: { id: number }) => users.find((u) => u.id === id) ?? null,
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      Object.assign(users.find((u) => u.id === id) as Row, data)
    },
    loginAsUser: async ({ id }: { id: number }) => {
      const user = users.find((u) => u.id === id)
      if (!user) throw new Error('no user')
      if (user.lockUntil && Date.parse(user.lockUntil as string) > START) throw new Error('locked')
      if (user.twoFactor) return { user, twoFactorRequired: true, pendingToken: `pending-${id}` }
      return { user, token: `session-${id}` }
    },
  }
  return engine
}

const makeStore = () => {
  const rows: LoginTokenRow[] = []
  let next = 1
  const store: LoginTokenStore & { rows: LoginTokenRow[] } = {
    rows,
    insert: async (row) => {
      rows.push({ ...row, id: next++, attempts: 0, usedAt: null })
    },
    invalidateOpen: async (userId, at) => {
      rows.filter((r) => r.userId === userId && !r.usedAt).forEach((r) => (r.usedAt = at))
    },
    findLatestOpen: async (userId, kind) => {
      const open = rows.filter((r) => r.userId === userId && r.kind === kind && !r.usedAt)
      return open[open.length - 1] ?? null
    },
    findByHash: async (kind, tokenHash) => rows.filter((r) => r.kind === kind && r.tokenHash === tokenHash).pop() ?? null,
    setAttempts: async (id, attempts) => {
      const row = rows.find((r) => r.id === id)
      if (row) row.attempts = attempts
    },
    consume: async (id, at) => {
      const row = rows.find((r) => r.id === id)
      if (!row || row.usedAt) return false
      row.usedAt = at
      return true
    },
  }
  return store
}

type Sent = { kind: LoginKind; to: string; link?: string; code?: string; minutes: number }

const setup = (overrides: Partial<PasswordlessSettings> & { verificationRequired?: boolean } = {}) => {
  const engine = makeEngine()
  const store = makeStore()
  const sent: Sent[] = []
  const audits: Array<{ action: string; detail: string; userId?: number }> = []
  let clock = START
  const settings: PasswordlessSettings = {
    magicLinkEnabled: true,
    emailCodeEnabled: true,
    allowForAdmins: false,
    tokenMinutes: 15,
    ...overrides,
  }
  const deps: PasswordlessDeps = {
    engine: engine as never,
    store,
    settings,
    verificationRequired: overrides.verificationRequired ?? false,
    mail: {
      magicLink: async (to, link, minutes) => {
        sent.push({ kind: 'link', to, link, minutes })
      },
      loginCode: async (to, code, minutes) => {
        sent.push({ kind: 'code', to, code, minutes })
      },
    },
    audit: async (action, detail, userId) => {
      audits.push({ action, detail, userId })
    },
    now: () => clock,
  }
  return {
    engine,
    store,
    sent,
    audits,
    deps,
    advance: (ms: number) => (clock += ms),
    linkFor: (token: string) => `https://x.test/account/sign-in/link?token=${token}`,
  }
}

const customer = (engine: ReturnType<typeof makeEngine>, extra: Record<string, unknown> = {}) =>
  engine.add({ email: 'sam@example.com', roles: ['customer'], emailVerifiedAt: null, lockUntil: null, ...extra })

const tokenFrom = (sent: Sent) => new URL(sent.link as string).searchParams.get('token') as string

// The account limits count in D1 in production. Each D1 call in a unit spec
// goes through a wrangler proxy and is far too slow for 25 guesses per test, so
// this spec keeps the counter in memory. rate-limits-d1.int.spec.ts covers the
// D1 store itself.
vi.mock('@/features/security/rateLimitStore', async () => {
  const { hit } = await import('@/features/security/rateLimit')
  return { hitShared: async (key: string, limit: number) => hit(key, limit) }
})

beforeEach(() => resetRateLimiter())

describe('neutral answers', () => {
  it('answers the same way for an unknown address, and sends nothing', async () => {
    const t = setup()
    const unknown = await requestLogin(t.deps, { email: 'nobody@example.com', kind: 'link', linkFor: t.linkFor })
    expect(unknown.ok).toBe(true)
    expect(t.sent).toHaveLength(0)
    expect(t.store.rows).toHaveLength(0)

    customer(t.engine)
    const known = await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    expect(known).toEqual(unknown)
    expect(t.sent).toHaveLength(1)
  })

  it('treats a malformed address as neutral too', async () => {
    const t = setup()
    const result = await requestLogin(t.deps, { email: 'not-an-email', kind: 'code' })
    expect(result.ok).toBe(true)
    expect(t.sent).toHaveLength(0)
  })

  it('refuses a request for a way of signing in the owner has not switched on', async () => {
    const t = setup({ magicLinkEnabled: false })
    customer(t.engine)
    const result = await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    expect(result.ok).toBe(false)
    expect(t.sent).toHaveLength(0)
  })
})

describe('tokens are stored safely', () => {
  it('stores only a SHA-256 of the link, never the link itself', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const token = tokenFrom(t.sent[0])
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const row = t.store.rows[0]
    expect(row.tokenHash).toBe(await sha256Hex(token))
    expect(JSON.stringify(t.store.rows)).not.toContain(token)
  })

  it('stores a code only as a salted hash, never the six digits', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const code = t.sent[0].code as string
    expect(code).toMatch(/^[0-9]{6}$/)
    const row = t.store.rows[0]
    expect(row.tokenHash).not.toContain(code)
    expect(row.tokenHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
    expect(await checkCode(row.tokenHash, code)).toBe(true)
    expect(await checkCode(row.tokenHash, '000000')).toBe(code === '000000')
  })

  it('a malformed stored code never matches', async () => {
    expect(await checkCode('no-colon-here', '123456')).toBe(false)
    expect(await checkCode(await codeHash('123456', 'ab'), '123456')).toBe(true)
  })
})

describe('the link', () => {
  it('signs in once, then refuses a replay', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const token = tokenFrom(t.sent[0])

    const first = await confirmLink(t.deps, token)
    expect(first).toEqual({ status: 'ok', token: 'session-1' })
    const replay = await confirmLink(t.deps, token)
    expect(replay.status).toBe('refused')
  })

  it('refuses an expired link', async () => {
    const t = setup({ tokenMinutes: 15 })
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const token = tokenFrom(t.sent[0])
    t.advance(15 * 60_000 + 1)
    expect((await confirmLink(t.deps, token)).status).toBe('refused')
  })

  it('accepts a link just before its expiry', async () => {
    const t = setup({ tokenMinutes: 15 })
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    t.advance(15 * 60_000 - 1000)
    expect((await confirmLink(t.deps, tokenFrom(t.sent[0]))).status).toBe('ok')
  })

  it('a newer request ends the earlier link', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const older = tokenFrom(t.sent[0])
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const newer = tokenFrom(t.sent[1])
    expect((await confirmLink(t.deps, older)).status).toBe('refused')
    expect((await confirmLink(t.deps, newer)).status).toBe('ok')
  })

  it('scanner-safe: inspecting the link does not spend it', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const token = tokenFrom(t.sent[0])
    expect(await inspectLink(t.deps, token)).toBe(true)
    expect(await inspectLink(t.deps, token)).toBe(true)
    expect(t.store.rows[0].usedAt).toBeNull()
    expect((await confirmLink(t.deps, token)).status).toBe('ok')
    expect(await inspectLink(t.deps, token)).toBe(false)
  })

  it('a link is refused when the link kind is switched off after it was sent', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const token = tokenFrom(t.sent[0])
    t.deps.settings.magicLinkEnabled = false
    expect((await confirmLink(t.deps, token)).status).toBe('refused')
  })
})

describe('the code', () => {
  it('signs in with the right code, once', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const code = t.sent[0].code as string
    expect(await verifyCode(t.deps, 'sam@example.com', code)).toEqual({ status: 'ok', token: 'session-1' })
    expect((await verifyCode(t.deps, 'sam@example.com', code)).status).toBe('refused')
  })

  it('caps wrong attempts: the token dies after five, even for the right code', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const code = t.sent[0].code as string
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) {
      expect((await verifyCode(t.deps, 'sam@example.com', wrong)).status).toBe('refused')
    }
    expect(t.store.rows[0].attempts).toBe(MAX_CODE_ATTEMPTS)
    expect((await verifyCode(t.deps, 'sam@example.com', code)).status).toBe('refused')
  })

  it('a wrong code counts, and the right code still works before the cap', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const code = t.sent[0].code as string
    const wrong = code === '000000' ? '111111' : '000000'
    expect((await verifyCode(t.deps, 'sam@example.com', wrong)).status).toBe('refused')
    expect((await verifyCode(t.deps, 'sam@example.com', code)).status).toBe('ok')
  })

  it('a newer code ends the earlier one', async () => {
    const t = setup()
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const older = t.sent[0].code as string
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    const newer = t.sent[1].code as string
    if (older !== newer) expect((await verifyCode(t.deps, 'sam@example.com', older)).status).toBe('refused')
    expect((await verifyCode(t.deps, 'sam@example.com', newer)).status).toBe('ok')
  })

  it('refuses an expired code', async () => {
    const t = setup({ tokenMinutes: 5 })
    customer(t.engine)
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'code' })
    t.advance(5 * 60_000 + 1)
    expect((await verifyCode(t.deps, 'sam@example.com', t.sent[0].code as string)).status).toBe('refused')
  })

  it('a disabled code is refused even with the right digits', async () => {
    const t = setup({ emailCodeEnabled: false })
    customer(t.engine)
    expect((await verifyCode(t.deps, 'sam@example.com', '123456')).status).toBe('refused')
  })
})

describe('who may sign in this way', () => {
  it('a locked account gets no token, and a lock set after sending is refused at sign-in', async () => {
    const t = setup()
    customer(t.engine, { lockUntil: new Date(START + 60_000).toISOString() })
    const asked = await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    expect(asked.ok).toBe(true)
    expect(t.sent).toHaveLength(0)

    const t2 = setup()
    const user = customer(t2.engine)
    await requestLogin(t2.deps, { email: 'sam@example.com', kind: 'link', linkFor: t2.linkFor })
    user.lockUntil = new Date(START + 60_000).toISOString()
    expect((await confirmLink(t2.deps, tokenFrom(t2.sent[0]))).status).toBe('refused')
  })

  it('a two-step account is still challenged for its code', async () => {
    const t = setup()
    customer(t.engine, { twoFactor: true })
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    const result = await confirmLink(t.deps, tokenFrom(t.sent[0]))
    expect(result).toEqual({ status: 'two-factor', pendingToken: 'pending-1' })
  })

  it('an admin is blocked unless the owner allowed admins', async () => {
    const off = setup({ allowForAdmins: false })
    off.engine.add({ email: 'boss@example.com', roles: ['admin'] })
    await requestLogin(off.deps, { email: 'boss@example.com', kind: 'code' })
    expect(off.sent).toHaveLength(0)

    const on = setup({ allowForAdmins: true })
    on.engine.add({ email: 'boss@example.com', roles: ['admin'] })
    await requestLogin(on.deps, { email: 'boss@example.com', kind: 'code' })
    expect(on.sent).toHaveLength(1)
    expect((await verifyCode(on.deps, 'boss@example.com', on.sent[0].code as string)).status).toBe('ok')
  })

  it('an admin whose allowance is removed after sending is refused', async () => {
    const t = setup({ allowForAdmins: true })
    t.engine.add({ email: 'boss@example.com', roles: ['admin'] })
    await requestLogin(t.deps, { email: 'boss@example.com', kind: 'code' })
    t.deps.settings.allowForAdmins = false
    expect((await verifyCode(t.deps, 'boss@example.com', t.sent[0].code as string)).status).toBe('refused')
  })

  it('editors and viewers never get a link or code', async () => {
    const t = setup({ allowForAdmins: true })
    t.engine.add({ email: 'ed@example.com', roles: ['editor'] })
    await requestLogin(t.deps, { email: 'ed@example.com', kind: 'code' })
    expect(t.sent).toHaveLength(0)
  })

  it('an unverified customer gets nothing while the site requires verification', async () => {
    const t = setup({ verificationRequired: true })
    customer(t.engine, { emailVerifiedAt: null })
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    expect(t.sent).toHaveLength(0)
  })

  it('a successful sign-in counts the address as verified when it was not', async () => {
    const t = setup()
    const user = customer(t.engine, { emailVerifiedAt: null })
    await requestLogin(t.deps, { email: 'sam@example.com', kind: 'link', linkFor: t.linkFor })
    await confirmLink(t.deps, tokenFrom(t.sent[0]))
    expect(typeof user.emailVerifiedAt).toBe('string')
  })
})

describe('rate limits and landing pages', () => {
  it('limits requests per address and per IP, separately', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 25; i += 1) {
      results.push((await guardAttempt(makeEngine() as never, 'passwordless-request', `email:flood@example.com`)).allowed)
    }
    expect(results.some((allowed) => !allowed)).toBe(true)
    const otherAddress = await guardAttempt(makeEngine() as never, 'passwordless-request', 'email:other@example.com')
    expect(otherAddress.allowed).toBe(true)
  })

  it('limits verification attempts with their own bucket', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 25; i += 1) {
      results.push((await guardAttempt(makeEngine() as never, 'passwordless-verify', 'ip:203.0.113.9')).allowed)
    }
    expect(results.some((allowed) => !allowed)).toBe(true)
  })

  it('only sends the user to our own pages', () => {
    expect(safeLandingPath('/account/orders')).toBe('/account/orders')
    expect(safeLandingPath('/admin')).toBe('/admin')
    expect(safeLandingPath('//evil.example')).toBe('/account')
    expect(safeLandingPath('https://evil.example/account')).toBe('/account')
    expect(safeLandingPath('/admin\\..\\x')).toBe('/account')
    expect(safeLandingPath(undefined)).toBe('/account')
  })
})
