// Session management: the per-device list, revocation, and the guarantees that
// nobody gets locked out. In-memory fakes for the users table and the sessions
// table, the same style as two-factor.int.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthDbOps, AuthUserRow } from '@/localapi/auth'
import { hashPassword, login, logout, refreshToken, resetPassword, verifyAuth, verifyJWT } from '@/localapi/auth'
import {
  SESSION_TOUCH_INTERVAL_MS,
  coarseIp,
  deviceLabelFromUserAgent,
  listSessions,
  revokeAll,
  revokeOtherSessions,
  revokeSession,
  sessionIdFromToken,
  type UserSessionRow,
  type UserSessionStore,
} from '@/features/security/userSessions'
import {
  adminRevokeAllForAccount,
  adminRevokeSession,
  revokeOwnOtherSessions,
  revokeOwnSession,
  viewAccountSessions,
  viewOwnSessions,
  type SessionActor,
  type SessionDeps,
} from '@/features/security/userSessionService'
import type { AuditAction } from '@/features/security/auditLog'

const SECRET = 'test-secret-do-not-use-in-prod'
const PASSWORD = 'correct horse battery staple'
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

type FakeStore = UserSessionStore & {
  rows: UserSessionRow[]
  calls: { touch: number; find: number }
  failFind: boolean
  failInsert: boolean
}

function makeStore(): FakeStore {
  const rows: UserSessionRow[] = []
  const store: FakeStore = {
    rows,
    calls: { touch: 0, find: 0 },
    failFind: false,
    failInsert: false,
    async insert(row) {
      if (store.failInsert) throw new Error('insert failed')
      rows.push({ ...row })
    },
    async findByID(id) {
      store.calls.find += 1
      if (store.failFind) throw new Error('D1 unavailable')
      const row = rows.find((r) => r.id === id)
      return row ? { ...row } : null
    },
    async listActiveForUser(userId, now) {
      return rows
        .filter((r) => r.userId === userId && !r.revokedAt && r.expiresAt > now)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({ ...r }))
    },
    async touch(id, lastSeenAt) {
      store.calls.touch += 1
      const row = rows.find((r) => r.id === id)
      if (row) row.lastSeenAt = lastSeenAt
    },
    async extend(id, expiresAt) {
      const row = rows.find((r) => r.id === id && !r.revokedAt)
      if (row) row.expiresAt = expiresAt
    },
    async revoke(id, userId, at) {
      const row = rows.find((r) => r.id === id && r.userId === userId && !r.revokedAt)
      if (!row) return false
      row.revokedAt = at
      return true
    },
    async revokeForUser(userId, exceptId, at) {
      let n = 0
      for (const row of rows) {
        if (row.userId === userId && row.id !== exceptId && !row.revokedAt) {
          row.revokedAt = at
          n += 1
        }
      }
      return n
    },
  }
  return store
}

function makeDb(initial: Partial<AuthUserRow>[], sessions?: UserSessionStore): AuthDbOps & { rows: AuthUserRow[]; resetToken: string | null } {
  const rows = initial.map((r) => ({ ...r })) as AuthUserRow[]
  const db = {
    rows,
    resetToken: null as string | null,
    sessions,
    async findByEmail(email: string) {
      return rows.find((r) => r.email === email) ?? null
    },
    async findByID(id: number) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findByResetToken(token: string) {
      return token && token === db.resetToken ? rows[0] : null
    },
    async updateByID(id: number, data: Record<string, unknown>) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return null
      rows[idx] = { ...rows[idx], ...data } as AuthUserRow
      return rows[idx]
    },
  }
  return db
}

function makeUser(overrides: Partial<AuthUserRow> = {}): Partial<AuthUserRow> {
  const { salt, hash } = hashPassword(PASSWORD)
  return {
    id: 1,
    email: 'user@example.com',
    roles: ['customer'],
    salt,
    hash,
    loginAttempts: 0,
    lockUntil: null,
    sessions: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const headersFor = (token: string) => ({ get: (name: string) => (name.toLowerCase() === 'authorization' ? `JWT ${token}` : null) })

const signIn = (db: AuthDbOps, client = { userAgent: CHROME_WIN, ip: '203.0.113.77' }) =>
  login(db, { email: 'user@example.com', password: PASSWORD, secret: SECRET, client })

describe('session list on sign-in', () => {
  it('creates a row with a device label and a truncated address, and puts its id in the token', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const result = await signIn(db)

    expect(result.token).toBeTruthy()
    const claims = verifyJWT(result.token as string, SECRET) as Record<string, unknown>
    expect(typeof claims.sid).toBe('string') // the engine's own claim is untouched
    expect(typeof claims.usid).toBe('string')
    expect(claims.jti).toBeTruthy()

    expect(store.rows).toHaveLength(1)
    const row = store.rows[0]
    expect(row.id).toBe(claims.usid)
    expect(row.userId).toBe(1)
    expect(row.deviceLabel).toBe('Chrome on Windows')
    expect(row.ip).toBe('203.0.113.0')
    expect(row.revokedAt).toBeNull()
    expect(row.tokenHash).not.toContain(String(claims.jti)) // only a hash is stored
    expect(Date.parse(row.expiresAt)).toBeGreaterThan(Date.parse(row.createdAt))
  })

  it('still signs in, without a session id, when the row cannot be written', async () => {
    const store = makeStore()
    store.failInsert = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const db = makeDb([makeUser()], store)
    const result = await signIn(db)
    const claims = verifyJWT(result.token as string, SECRET) as Record<string, unknown>
    expect(claims.usid).toBeUndefined()
    expect((await verifyAuth(db, { headers: headersFor(result.token as string), secret: SECRET })).user).not.toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('does not write a row when asked to skip (password re-confirmation)', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const result = await signIn(db, { skipSession: true } as never)
    expect(result.token).toBeTruthy()
    expect(store.rows).toHaveLength(0)
  })

  it('works unchanged when no sessions store is wired', async () => {
    const db = makeDb([makeUser()])
    const result = await signIn(db)
    expect(result.token).toBeTruthy()
    expect((await verifyAuth(db, { headers: headersFor(result.token as string), secret: SECRET })).user).not.toBeNull()
  })
})

describe('validating a token', () => {
  it('accepts a live session', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user?.id).toBe(1)
  })

  it('refuses a revoked session, and refresh cannot bring it back', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    store.rows[0].revokedAt = new Date().toISOString()

    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user).toBeNull()
    await expect(refreshToken(db, { headers: headersFor(token as string), secret: SECRET })).rejects.toThrow()
  })

  it('refuses an expired row and a vanished row', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    store.rows[0].expiresAt = new Date(Date.now() - 1000).toISOString()
    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user).toBeNull()
    store.rows.length = 0
    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user).toBeNull()
  })

  it('refuses a token whose jti does not match the stored hash', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    store.rows[0].tokenHash = 'f'.repeat(64)
    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user).toBeNull()
  })

  it('keeps a token issued BEFORE this change valid (no usid), whatever the table holds', async () => {
    const legacyDb = makeDb([makeUser()]) // no store: this is how every pre-deploy token was minted
    const { token } = await signIn(legacyDb)
    expect(verifyJWT(token as string, SECRET)?.usid).toBeUndefined()

    const store = makeStore()
    legacyDb.sessions = store // the deploy
    expect((await verifyAuth(legacyDb, { headers: headersFor(token as string), secret: SECRET })).user?.id).toBe(1)
    expect(store.calls.find).toBe(0) // never even looked up

    store.failFind = true
    expect((await verifyAuth(legacyDb, { headers: headersFor(token as string), secret: SECRET })).user?.id).toBe(1)
    await revokeAll(store, 1)
    expect((await verifyAuth(legacyDb, { headers: headersFor(token as string), secret: SECRET })).user?.id).toBe(1)
  })

  it('fails OPEN, with a logged warning, when the session lookup errors', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    store.failFind = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect((await verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })).user?.id).toBe(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('Session lookup failed')
    warn.mockRestore()
  })

  it('a refresh carries the session id forward and extends the row', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    const { token } = await signIn(db)
    const before = store.rows[0].expiresAt
    await new Promise((resolve) => setTimeout(resolve, 5))
    const refreshed = await refreshToken(db, { headers: headersFor(token as string), secret: SECRET })
    expect(verifyJWT(refreshed.token, SECRET)?.usid).toBe(store.rows[0].id)
    expect(store.rows[0].expiresAt > before).toBe(true)
  })
})

describe('last-seen throttle', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  it('writes last_seen_at at most once per interval', async () => {
    const store = makeStore()
    const db = makeDb([makeUser()], store)
    vi.setSystemTime(new Date('2026-06-01T10:00:00.000Z'))
    const { token } = await signIn(db)
    const check = () => verifyAuth(db, { headers: headersFor(token as string), secret: SECRET })

    await check()
    vi.setSystemTime(new Date('2026-06-01T10:02:00.000Z'))
    await check()
    await check()
    expect(store.calls.touch).toBe(0) // sign-in stamped it; under 5 minutes since

    vi.setSystemTime(new Date(Date.parse('2026-06-01T10:00:00.000Z') + SESSION_TOUCH_INTERVAL_MS + 1000))
    await check()
    expect(store.calls.touch).toBe(1)
    expect(store.rows[0].lastSeenAt).toBe(new Date().toISOString())

    await check()
    await check()
    expect(store.calls.touch).toBe(1)
  })
})

describe('revoking', () => {
  async function twoDevices() {
    const store = makeStore()
    const db = makeDb([makeUser(), makeUser({ id: 2, email: 'other@example.com' })], store)
    const a = await signIn(db, { userAgent: CHROME_WIN, ip: '203.0.113.5' })
    const b = await signIn(db, { userAgent: SAFARI_IOS, ip: '198.51.100.9' })
    const idA = sessionIdFromToken(a.token) as string
    const idB = sessionIdFromToken(b.token) as string
    return { store, db, a, b, idA, idB }
  }

  it('revokeSession ends one session, only for its owner', async () => {
    const { store, db, a, b, idA, idB } = await twoDevices()
    expect(await revokeSession(store, 2, idA)).toBe(false) // someone else's id
    expect(await revokeSession(store, 1, idA)).toBe(true)
    expect(await revokeSession(store, 1, idA)).toBe(false) // already ended
    expect((await verifyAuth(db, { headers: headersFor(a.token as string), secret: SECRET })).user).toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(b.token as string), secret: SECRET })).user).not.toBeNull()
    expect(idB).toBeTruthy()
  })

  it('revokeOtherSessions keeps the current one', async () => {
    const { store, db, a, b, idA } = await twoDevices()
    expect(await revokeOtherSessions(store, 1, idA)).toBe(1)
    expect((await verifyAuth(db, { headers: headersFor(a.token as string), secret: SECRET })).user).not.toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(b.token as string), secret: SECRET })).user).toBeNull()
  })

  it('revokeAll ends every session of that user and leaves other users alone', async () => {
    const { store, db, a } = await twoDevices()
    const other = await login(db, { email: 'other@example.com', password: PASSWORD, secret: SECRET, client: { userAgent: CHROME_WIN } })
    expect(await revokeAll(store, 1)).toBe(2)
    expect((await verifyAuth(db, { headers: headersFor(a.token as string), secret: SECRET })).user).toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(other.token as string), secret: SECRET })).user?.id).toBe(2)
  })

  it('logout marks that session revoked and leaves the others', async () => {
    const { store, db, a, b, idA, idB } = await twoDevices()
    await logout(db, { headers: headersFor(a.token as string), secret: SECRET })
    expect(store.rows.find((r) => r.id === idA)?.revokedAt).toBeTruthy()
    expect(store.rows.find((r) => r.id === idB)?.revokedAt).toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(b.token as string), secret: SECRET })).user).not.toBeNull()
  })

  it('a password reset ends every earlier session and issues a fresh one', async () => {
    const { store, db, a, b } = await twoDevices()
    db.resetToken = 'reset-token'
    const result = await resetPassword(db, { token: 'reset-token', password: 'a brand new password', secret: SECRET, client: { userAgent: SAFARI_IOS } })

    expect((await verifyAuth(db, { headers: headersFor(a.token as string), secret: SECRET })).user).toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(b.token as string), secret: SECRET })).user).toBeNull()
    expect((await verifyAuth(db, { headers: headersFor(result.token), secret: SECRET })).user?.id).toBe(1)
    expect(store.rows.filter((r) => !r.revokedAt)).toHaveLength(1)
  })

  it('a reset that skips the session (customer flow, no cookie) leaves no phantom device', async () => {
    const { store, db } = await twoDevices()
    db.resetToken = 'reset-token'
    await resetPassword(db, { token: 'reset-token', password: 'a brand new password', secret: SECRET, client: { skipSession: true } })
    expect(store.rows.filter((r) => !r.revokedAt)).toHaveLength(0)
  })

  it('a reset still succeeds when revoking fails', async () => {
    const { store, db } = await twoDevices()
    store.revokeForUser = async () => {
      throw new Error('D1 unavailable')
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    db.resetToken = 'reset-token'
    const result = await resetPassword(db, { token: 'reset-token', password: 'a brand new password', secret: SECRET })
    expect(result.token).toBeTruthy()
    warn.mockRestore()
  })

  it('lists only live sessions, newest first', async () => {
    const { store, idA, idB } = await twoDevices()
    store.rows.find((r) => r.id === idA)!.createdAt = '2026-01-01T00:00:00.000Z'
    store.rows.find((r) => r.id === idB)!.createdAt = '2026-02-01T00:00:00.000Z'
    expect((await listSessions(store, 1)).map((r) => r.id)).toEqual([idB, idA])
    await revokeSession(store, 1, idB)
    expect((await listSessions(store, 1)).map((r) => r.id)).toEqual([idA])
  })
})

describe('the screens behind the list', () => {
  const customer: SessionActor = { id: 1, email: 'user@example.com', roles: ['customer'] }
  const admin: SessionActor = { id: 9, email: 'boss@example.com', roles: ['admin'] }

  function setup(limited = false) {
    const store = makeStore()
    const audits: Array<{ action: AuditAction; actor: SessionActor; detail: string }> = []
    const deps: SessionDeps = {
      store,
      record: async (action, actor, detail) => {
        audits.push({ action, actor, detail })
      },
      limited: () => limited,
      emailFor: async (id) => (id === 1 ? 'user@example.com' : null),
    }
    return { store, deps, audits }
  }

  async function seed(store: FakeStore) {
    const db = makeDb([makeUser()], store)
    const a = await signIn(db)
    const b = await signIn(db, { userAgent: SAFARI_IOS, ip: '198.51.100.9' })
    return { idA: sessionIdFromToken(a.token) as string, idB: sessionIdFromToken(b.token) as string }
  }

  it('marks this device and offers the others', async () => {
    const { store, deps } = setup()
    const { idA } = await seed(store)
    const views = await viewOwnSessions(deps, customer, idA)
    expect(views).toHaveLength(2)
    expect(views.filter((v) => v.current).map((v) => v.id)).toEqual([idA])
  })

  it('revokes another device, refuses the current one, and audits', async () => {
    const { store, deps, audits } = setup()
    const { idA, idB } = await seed(store)
    expect((await revokeOwnSession(deps, customer, idA, idA)).ok).toBe(false)
    expect((await revokeOwnSession(deps, customer, idA, idB)).ok).toBe(true)
    expect(audits.map((a) => a.action)).toEqual(['session.revoked'])
    expect((await revokeOwnSession(deps, customer, idA, idB)).ok).toBe(false) // already ended
  })

  it('cannot revoke somebody else\'s session through the customer path', async () => {
    const { store, deps } = setup()
    const { idB } = await seed(store)
    const stranger: SessionActor = { id: 2, email: 'other@example.com', roles: ['customer'] }
    expect((await revokeOwnSession(deps, stranger, null, idB)).ok).toBe(false)
    expect(store.rows.find((r) => r.id === idB)?.revokedAt).toBeNull()
  })

  it('"sign out other devices" keeps the current one and audits', async () => {
    const { store, deps, audits } = setup()
    const { idA, idB } = await seed(store)
    const outcome = await revokeOwnOtherSessions(deps, customer, idA)
    expect(outcome.ok).toBe(true)
    expect(store.rows.find((r) => r.id === idA)?.revokedAt).toBeNull()
    expect(store.rows.find((r) => r.id === idB)?.revokedAt).toBeTruthy()
    expect(audits[0].action).toBe('session.revoked-others')
  })

  it('rate limits revoke actions', async () => {
    const { store, deps, audits } = setup(true)
    const { idA, idB } = await seed(store)
    expect((await revokeOwnSession(deps, customer, idA, idB)).ok).toBe(false)
    expect((await revokeOwnOtherSessions(deps, customer, idA)).ok).toBe(false)
    expect((await adminRevokeSession(deps, admin, idB)).ok).toBe(false)
    expect(store.rows.every((r) => !r.revokedAt)).toBe(true)
    expect(audits).toHaveLength(0)
  })

  it('lets an admin revoke another user\'s session, and writes an audit entry naming the account', async () => {
    const { store, deps, audits } = setup()
    const { idB } = await seed(store)
    expect((await viewAccountSessions(deps, admin, 1))?.length).toBe(2)

    const outcome = await adminRevokeSession(deps, admin, idB)
    expect(outcome.ok).toBe(true)
    expect(store.rows.find((r) => r.id === idB)?.revokedAt).toBeTruthy()
    expect(audits).toHaveLength(1)
    expect(audits[0].action).toBe('session.admin-revoked')
    expect(audits[0].actor.id).toBe(9)
    expect(audits[0].detail).toContain('user@example.com')
    expect(audits[0].detail).toContain(idB)
  })

  it('lets an admin sign out every device of an account, audited', async () => {
    const { store, deps, audits } = setup()
    await seed(store)
    expect((await adminRevokeAllForAccount(deps, admin, 1)).ok).toBe(true)
    expect(store.rows.every((r) => r.revokedAt)).toBe(true)
    expect(audits[0].action).toBe('session.admin-revoked')
  })

  it('refuses the admin-only paths for everyone else', async () => {
    const { store, deps, audits } = setup()
    const { idB } = await seed(store)
    expect(await viewAccountSessions(deps, customer, 1)).toBeNull()
    expect((await adminRevokeSession(deps, customer, idB)).ok).toBe(false)
    expect((await adminRevokeAllForAccount(deps, customer, 1)).ok).toBe(false)
    expect(store.rows.every((r) => !r.revokedAt)).toBe(true)
    expect(audits).toHaveLength(0)
  })
})

describe('password change hook on the Users collection', () => {
  const fake = makeStore()

  beforeEach(() => {
    fake.rows.length = 0
    vi.resetModules()
    vi.doMock('@/features/security/userSessionStore', () => ({ defaultUserSessionStore: fake }))
  })
  afterEach(() => vi.doUnmock('@/features/security/userSessionStore'))

  async function run(args: Record<string, unknown>) {
    const { revokeSessionsOnPasswordChange } = await import('@/features/security/passwordSessionHook')
    await (revokeSessionsOnPasswordChange as unknown as (a: unknown) => Promise<unknown>)(args)
  }

  async function seed() {
    const db = makeDb([makeUser()], fake)
    const a = await signIn(db)
    const b = await signIn(db)
    return { idA: sessionIdFromToken(a.token) as string, idB: sessionIdFromToken(b.token) as string }
  }

  it('an admin changing their own password keeps their own session and ends the rest', async () => {
    const { idA, idB } = await seed()
    await run({ operation: 'update', doc: { id: 1 }, data: { password: 'new password!' }, req: { user: { id: 1 }, currentSessionId: idA } })
    expect(fake.rows.find((r) => r.id === idA)?.revokedAt).toBeNull()
    expect(fake.rows.find((r) => r.id === idB)?.revokedAt).toBeTruthy()
  })

  it('an admin changing somebody else\'s password ends all of that account\'s sessions', async () => {
    await seed()
    await run({ operation: 'update', doc: { id: 1 }, data: { password: 'new password!' }, req: { user: { id: 9 }, currentSessionId: 'whatever' } })
    expect(fake.rows.every((r) => r.revokedAt)).toBe(true)
  })

  it('leaves the caller to decide when it is a self change with no request information', async () => {
    await seed()
    await run({ operation: 'update', doc: { id: 1 }, data: { password: 'new password!' }, req: { user: { id: 1 } } })
    expect(fake.rows.every((r) => !r.revokedAt)).toBe(true)
  })

  it('does nothing when the password was not part of the change', async () => {
    await seed()
    await run({ operation: 'update', doc: { id: 1 }, data: { displayName: 'x' }, req: { user: { id: 9 } } })
    await run({ operation: 'update', doc: { id: 1 }, data: { password: '' }, req: { user: { id: 9 } } })
    expect(fake.rows.every((r) => !r.revokedAt)).toBe(true)
  })

  it('never fails the change when the table is unavailable', async () => {
    await seed()
    fake.revokeForUser = async () => {
      throw new Error('D1 unavailable')
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(run({ operation: 'update', doc: { id: 1 }, data: { password: 'new password!' }, req: { user: { id: 9 } } })).resolves.toBeUndefined()
    warn.mockRestore()
  })
})

describe('helpers', () => {
  it('labels devices coarsely', () => {
    expect(deviceLabelFromUserAgent(CHROME_WIN)).toBe('Chrome on Windows')
    expect(deviceLabelFromUserAgent(SAFARI_IOS)).toBe('Safari on iOS')
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe('Firefox on Linux')
    expect(deviceLabelFromUserAgent(null)).toBe('Unknown device')
  })

  it('truncates addresses', () => {
    expect(coarseIp('203.0.113.77')).toBe('203.0.113.0')
    expect(coarseIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::')
    expect(coarseIp('not an address')).toBeNull()
    expect(coarseIp(null)).toBeNull()
  })

  it('reads the session id off a token without needing the secret', () => {
    expect(sessionIdFromToken('garbage')).toBeNull()
    expect(sessionIdFromToken(null)).toBeNull()
  })
})
