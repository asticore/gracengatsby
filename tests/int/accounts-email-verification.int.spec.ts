// @vitest-environment node
// Customer email verification, against an in-memory stand-in for the engine.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent = vi.hoisted(() => [] as Array<{ to: string; url: string }>)

vi.mock('@/features/accounts/emails', () => ({
  sendVerifyEmail: async (to: string, url: string) => {
    sent.push({ to, url })
    return { ok: true }
  },
  sendWelcomeEmail: async () => ({ ok: true }),
  sendResetEmail: async () => ({ ok: true }),
  sendAlreadyRegisteredEmail: async () => ({ ok: true }),
}))

import {
  completeVerification,
  hashVerifyToken,
  issueVerification,
  registerCustomer,
  resendVerification,
  signIn,
} from '@/features/accounts/auth'

type Row = Record<string, unknown> & { id: number }

const makeEngine = (requireVerification: boolean) => {
  const users: Row[] = []
  let next = 1
  const engine = {
    users,
    findGlobal: async () => ({ accountSettings: { requireEmailVerification: requireVerification } }),
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
  return engine
}

const urlFor = (token: string) => `https://x.test/account/verify-email?token=${token}`
const tokenFromLastEmail = () => new URL(sent[sent.length - 1].url).searchParams.get('token') as string
const urls = { signIn: '/s', forgotPassword: '/f', account: '/a' }

beforeEach(() => {
  sent.length = 0
})

describe('email verification tokens', () => {
  it('stores a SHA-256 hash, never the token, with a 24 hour expiry', async () => {
    const engine = makeEngine(true)
    const user = await engine.create({ data: { email: 'a@b.co', password: 'pw', roles: ['customer'] } })
    await issueVerification(engine as never, user.id, 'a@b.co', urlFor)

    const token = tokenFromLastEmail()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const row = engine.users[0]
    expect(row.emailVerifyTokenHash).toBe(await hashVerifyToken(token))
    expect(JSON.stringify(row)).not.toContain(token)
    const ttl = Date.parse(row.emailVerifyExpiresAt as string) - Date.now()
    expect(ttl).toBeGreaterThan(23.9 * 3600_000)
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000)
  })

  it('verifies once, then refuses a replay', async () => {
    const engine = makeEngine(true)
    const user = await engine.create({ data: { email: 'a@b.co', password: 'pw', roles: ['customer'] } })
    await issueVerification(engine as never, user.id, 'a@b.co', urlFor)
    const token = tokenFromLastEmail()

    expect((await completeVerification(engine as never, token)).ok).toBe(true)
    expect(engine.users[0].emailVerifiedAt).toBeTruthy()
    expect(engine.users[0].emailVerifyTokenHash).toBeNull()

    expect((await completeVerification(engine as never, token)).ok).toBe(false)
  })

  it('refuses an expired or unknown token', async () => {
    const engine = makeEngine(true)
    const user = await engine.create({ data: { email: 'a@b.co', password: 'pw', roles: ['customer'] } })
    await issueVerification(engine as never, user.id, 'a@b.co', urlFor)
    const token = tokenFromLastEmail()
    engine.users[0].emailVerifyExpiresAt = new Date(Date.now() - 1000).toISOString()

    expect((await completeVerification(engine as never, token)).ok).toBe(false)
    expect(engine.users[0].emailVerifiedAt).toBeUndefined()
    expect((await completeVerification(engine as never, 'nope')).ok).toBe(false)
    expect((await completeVerification(engine as never, '')).ok).toBe(false)
  })
})

describe('registration and resend', () => {
  it('sends a verification email on register only when the setting is on', async () => {
    const on = makeEngine(true)
    await registerCustomer(on as never, 'new@b.co', 'password1', urls, urlFor)
    expect(sent).toHaveLength(1)
    expect(on.users[0].emailVerifyTokenHash).toBeTruthy()

    sent.length = 0
    const off = makeEngine(false)
    await registerCustomer(off as never, 'new@b.co', 'password1', urls, urlFor)
    expect(sent).toHaveLength(0)
    expect(off.users[0].emailVerifyTokenHash).toBeUndefined()
  })

  it('resend is silent for unknown, verified and admin accounts', async () => {
    const engine = makeEngine(true)
    await engine.create({ data: { email: 'c@b.co', password: 'pw', roles: ['customer'] } })
    await engine.create({ data: { email: 'v@b.co', password: 'pw', roles: ['customer'], emailVerifiedAt: 'x' } })
    await engine.create({ data: { email: 'ad@b.co', password: 'pw', roles: ['admin'] } })

    for (const email of ['nobody@b.co', 'v@b.co', 'ad@b.co']) await resendVerification(engine as never, email, urlFor)
    expect(sent).toHaveLength(0)

    await resendVerification(engine as never, 'c@b.co', urlFor)
    expect(sent).toHaveLength(1)
  })
})

describe('sign-in gate', () => {
  it('refuses an unverified customer when the setting is on', async () => {
    const engine = makeEngine(true)
    await engine.create({ data: { email: 'c@b.co', password: 'pw', roles: ['customer'] } })
    const result = await signIn(engine as never, 'c@b.co', 'pw')
    expect(result.ok).toBe(false)
    expect(result.token).toBeUndefined()
    expect(result.needsVerification).toBe(true)
    expect(result.message).toBe('Verify your email first')
  })

  it('allows a verified customer when the setting is on', async () => {
    const engine = makeEngine(true)
    await engine.create({ data: { email: 'c@b.co', password: 'pw', roles: ['customer'], emailVerifiedAt: 'x' } })
    expect((await signIn(engine as never, 'c@b.co', 'pw')).ok).toBe(true)
  })

  it('allows an unverified customer when the setting is off', async () => {
    const engine = makeEngine(false)
    await engine.create({ data: { email: 'c@b.co', password: 'pw', roles: ['customer'] } })
    expect((await signIn(engine as never, 'c@b.co', 'pw')).ok).toBe(true)
  })

  it('never blocks an admin, or a customer who is also staff', async () => {
    const engine = makeEngine(true)
    await engine.create({ data: { email: 'ad@b.co', password: 'pw', roles: ['admin'] } })
    await engine.create({ data: { email: 'ed@b.co', password: 'pw', roles: ['customer', 'editor'] } })
    expect((await signIn(engine as never, 'ad@b.co', 'pw')).ok).toBe(true)
    expect((await signIn(engine as never, 'ed@b.co', 'pw')).ok).toBe(true)
  })

  it('keeps the generic message for a wrong password', async () => {
    const engine = makeEngine(true)
    await engine.create({ data: { email: 'c@b.co', password: 'pw', roles: ['customer'] } })
    const result = await signIn(engine as never, 'c@b.co', 'wrong')
    expect(result.needsVerification).toBeUndefined()
    expect(result.message).toBe('Those details do not match an account.')
  })
})
