// Pure unit tests for src/localapi/auth.ts's own internal logic - a mocked
// `AuthDbOps` (a tiny in-memory fake, same style `localapi-operations.int
// .spec.ts`'s `makeFakeDb` establishes for `CollectionDbOps`), no
// `getEngine()`/live DB here - same reasoning `localapi-access.int.spec.ts`/
// `localapi-hooks.int.spec.ts` give for staying off the real engine for pure
// logic tests. Real, unmodified wiring against the real `src/cms/db` users
// collection is a separate concern for whichever later stage cuts this
// module over.
import { describe, expect, it } from 'vitest'

import type { AuthDbOps, AuthUserRow } from '@/localapi/auth'
import {
  AuthenticationError,
  forgotPassword,
  hashPassword,
  InvalidResetToken,
  LOCK_TIME_MS,
  LockedAuth,
  login,
  MAX_LOGIN_ATTEMPTS,
  resetPassword,
  signJWT,
  verifyAuth,
  verifyJWT,
  verifyPassword,
} from '@/localapi/auth'

/* -------------------------------------------------------------------------- */
/* Test fixtures                                                              */
/* -------------------------------------------------------------------------- */

const SECRET = 'test-secret-do-not-use-in-prod'
const CORRECT_PASSWORD = 'correct horse battery staple'

function makeFakeAuthDb(initial: AuthUserRow[] = []): AuthDbOps & { rows: AuthUserRow[] } {
  const rows = initial.map((r) => ({ ...r }))
  return {
    rows,
    async findByEmail(email) {
      return rows.find((r) => r.email === email) ?? null
    },
    async findByID(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async findByResetToken(token) {
      const now = Date.now()
      return (
        rows.find((r) => r.resetPasswordToken === token && typeof r.resetPasswordExpiration === 'string' && new Date(r.resetPasswordExpiration).getTime() > now) ?? null
      )
    },
    async updateByID(id, data) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx === -1) return null
      rows[idx] = { ...rows[idx], ...data } as AuthUserRow
      return rows[idx]
    },
  }
}

function makeUser(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
  const { salt, hash } = hashPassword(CORRECT_PASSWORD)
  return {
    id: 1,
    email: 'user@example.com',
    roles: ['customer'],
    salt,
    hash,
    loginAttempts: 0,
    lockUntil: null,
    resetPasswordToken: null,
    resetPasswordExpiration: null,
    sessions: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const isoInFuture = (ms: number) => new Date(Date.now() + ms).toISOString()
const isoInPast = (ms: number) => new Date(Date.now() - ms).toISOString()

/* -------------------------------------------------------------------------- */
/* login                                                                       */
/* -------------------------------------------------------------------------- */

describe('localapi/auth - login', () => {
  it('succeeds with correct credentials: returns correct claims/token/exp, JWT verifies with the right secret', async () => {
    const db = makeFakeAuthDb([makeUser()])

    const result = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    expect(result.user.id).toBe(1)
    expect(result.user.email).toBe('user@example.com')
    expect(result.user).not.toHaveProperty('hash')
    expect(result.user).not.toHaveProperty('salt')
    expect(result.user).not.toHaveProperty('sessions')
    expect(result.user).not.toHaveProperty('loginAttempts')
    expect(result.user).not.toHaveProperty('lockUntil')

    const claims = verifyJWT(result.token, SECRET)
    expect(claims).not.toBeNull()
    expect(claims?.id).toBe(1)
    expect(claims?.collection).toBe('users')
    expect(claims?.email).toBe('user@example.com')
    expect(typeof claims?.sid).toBe('string')
    expect(claims?.exp).toBe(result.exp)

    // The minted session was actually persisted, with the same sid the JWT carries.
    expect(db.rows[0].sessions).toHaveLength(1)
    expect(db.rows[0].sessions?.[0]?.id).toBe(claims?.sid)
  })

  it('rejects a wrong password with AuthenticationError, and increments loginAttempts', async () => {
    const db = makeFakeAuthDb([makeUser()])

    await expect(login(db, { email: 'user@example.com', password: 'nope', secret: SECRET })).rejects.toBeInstanceOf(AuthenticationError)

    expect(db.rows[0].loginAttempts).toBe(1)
    expect(db.rows[0].lockUntil).toBeNull()
  })

  it('rejects login for an unknown email with AuthenticationError', async () => {
    const db = makeFakeAuthDb([])
    await expect(login(db, { email: 'nobody@example.com', password: 'whatever', secret: SECRET })).rejects.toBeInstanceOf(AuthenticationError)
  })

  it('locks the account after MAX_LOGIN_ATTEMPTS failed attempts, with the exact attempts/lockUntil progression, and the 5th attempt throws LockedAuth (not AuthenticationError)', async () => {
    expect(MAX_LOGIN_ATTEMPTS).toBe(5)
    const db = makeFakeAuthDb([makeUser()])

    for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS - 1; attempt++) {
      await expect(login(db, { email: 'user@example.com', password: 'nope', secret: SECRET })).rejects.toBeInstanceOf(AuthenticationError)
      expect(db.rows[0].loginAttempts).toBe(attempt)
      expect(db.rows[0].lockUntil).toBeNull()
    }

    // 5th (final) failed attempt trips the lock and must throw LockedAuth, not AuthenticationError.
    const before = Date.now()
    await expect(login(db, { email: 'user@example.com', password: 'nope', secret: SECRET })).rejects.toBeInstanceOf(LockedAuth)
    expect(db.rows[0].loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
    expect(db.rows[0].lockUntil).not.toBeNull()
    const lockUntilMs = new Date(db.rows[0].lockUntil as string).getTime()
    expect(lockUntilMs).toBeGreaterThan(before)
    expect(lockUntilMs).toBeLessThanOrEqual(before + LOCK_TIME_MS + 5_000)
  })

  it('a locked account rejects even a CORRECT password, without touching loginAttempts', async () => {
    const db = makeFakeAuthDb([makeUser({ loginAttempts: 5, lockUntil: isoInFuture(LOCK_TIME_MS) })])

    await expect(login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })).rejects.toBeInstanceOf(LockedAuth)
    // Locked is checked BEFORE the password is verified - attempts must not move.
    expect(db.rows[0].loginAttempts).toBe(5)
  })

  it('an expired lockUntil allows a fresh attempt, and a subsequent wrong attempt restarts the counter at 1 (not 6)', async () => {
    const db = makeFakeAuthDb([makeUser({ loginAttempts: 5, lockUntil: isoInPast(1_000) })])

    await expect(login(db, { email: 'user@example.com', password: 'still wrong', secret: SECRET })).rejects.toBeInstanceOf(AuthenticationError)

    expect(db.rows[0].loginAttempts).toBe(1)
    expect(db.rows[0].lockUntil).toBeNull()
  })

  it('a successful login resets a previously-nonzero loginAttempts to 0 (and clears lockUntil)', async () => {
    const db = makeFakeAuthDb([makeUser({ loginAttempts: 3, lockUntil: null })])

    await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    expect(db.rows[0].loginAttempts).toBe(0)
    expect(db.rows[0].lockUntil).toBeNull()
  })

  it('does not write a loginAttempts-reset update when there was nothing to reset', async () => {
    const db = makeFakeAuthDb([makeUser({ loginAttempts: 0, lockUntil: null })])
    let updateCalls = 0
    const countingDb: AuthDbOps = {
      ...db,
      updateByID: async (id, data) => {
        updateCalls++
        return db.updateByID(id, data)
      },
    }

    await login(countingDb, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    // Exactly one write (the session mint) - no separate reset write when attempts/lockUntil were already clean.
    expect(updateCalls).toBe(1)
  })

  it('prunes expired sessions and keeps unexpired ones on a new login', async () => {
    const db = makeFakeAuthDb([
      makeUser({
        sessions: [
          { id: 'expired-session', createdAt: isoInPast(10_000), expiresAt: isoInPast(1_000) },
          { id: 'still-valid-session', createdAt: isoInPast(1_000), expiresAt: isoInFuture(60_000) },
        ],
      }),
    ])

    const result = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })
    const claims = verifyJWT(result.token, SECRET)

    const sessionIds = (db.rows[0].sessions ?? []).map((s) => s.id)
    expect(sessionIds).toContain('still-valid-session')
    expect(sessionIds).not.toContain('expired-session')
    expect(sessionIds).toContain(claims?.sid)
    expect(sessionIds).toHaveLength(2)
  })
})

/* -------------------------------------------------------------------------- */
/* resetPassword                                                              */
/* -------------------------------------------------------------------------- */

describe('localapi/auth - resetPassword', () => {
  it('success path: new password verifies, old password no longer verifies, returns { user, token } with NO exp field, and does not touch loginAttempts/lockUntil', async () => {
    const db = makeFakeAuthDb([
      makeUser({
        resetPasswordToken: 'a-valid-token',
        resetPasswordExpiration: isoInFuture(30 * 60_000),
        loginAttempts: 2,
        lockUntil: null,
      }),
    ])

    const result = await resetPassword(db, { token: 'a-valid-token', password: 'a brand new password', secret: SECRET })

    expect(result).not.toHaveProperty('exp')
    expect(result.user.id).toBe(1)
    expect(result.user).not.toHaveProperty('hash')

    expect(verifyPassword('a brand new password', db.rows[0].salt as string, db.rows[0].hash as string)).toBe(true)
    expect(verifyPassword(CORRECT_PASSWORD, db.rows[0].salt as string, db.rows[0].hash as string)).toBe(false)

    // Reset does not touch the lockout counters.
    expect(db.rows[0].loginAttempts).toBe(2)
    expect(db.rows[0].lockUntil).toBeNull()

    // A session was minted and a real, verifiable JWT was returned.
    const claims = verifyJWT(result.token, SECRET)
    expect(claims).not.toBeNull()
    expect(claims?.id).toBe(1)
    expect(claims?.collection).toBe('users')
  })

  it('expires the resetPasswordToken immediately (resetPasswordExpiration moved to now) rather than clearing the token itself', async () => {
    const db = makeFakeAuthDb([makeUser({ resetPasswordToken: 'a-valid-token', resetPasswordExpiration: isoInFuture(30 * 60_000) })])

    const before = Date.now()
    await resetPassword(db, { token: 'a-valid-token', password: 'new-password', secret: SECRET })

    expect(db.rows[0].resetPasswordToken).toBe('a-valid-token')
    const expiresAtMs = new Date(db.rows[0].resetPasswordExpiration as string).getTime()
    expect(expiresAtMs).toBeGreaterThanOrEqual(before)
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + 1_000)
  })

  it('throws InvalidResetToken for an unknown token', async () => {
    const db = makeFakeAuthDb([makeUser({ resetPasswordToken: 'the-real-token', resetPasswordExpiration: isoInFuture(30 * 60_000) })])
    await expect(resetPassword(db, { token: 'wrong-token', password: 'new-password', secret: SECRET })).rejects.toBeInstanceOf(InvalidResetToken)
  })

  it('throws InvalidResetToken for a correct-but-expired token', async () => {
    const db = makeFakeAuthDb([makeUser({ resetPasswordToken: 'the-real-token', resetPasswordExpiration: isoInPast(1_000) })])
    await expect(resetPassword(db, { token: 'the-real-token', password: 'new-password', secret: SECRET })).rejects.toBeInstanceOf(InvalidResetToken)
  })

  it('throws when token or password is missing from the args object entirely (explicit presence check)', async () => {
    const db = makeFakeAuthDb([makeUser({ resetPasswordToken: 'tok', resetPasswordExpiration: isoInFuture(60_000) })])
    // Simulate an untyped caller (e.g. a raw API route body) omitting a key entirely.
    const badArgs = { token: 'tok' } as unknown as Parameters<typeof resetPassword>[1]
    await expect(resetPassword(db, badArgs)).rejects.toThrow('Missing required data.')
  })
})

/* -------------------------------------------------------------------------- */
/* forgotPassword                                                              */
/* -------------------------------------------------------------------------- */

describe('localapi/auth - forgotPassword', () => {
  it('returns a token for a known email, and writes resetPasswordToken/resetPasswordExpiration using the caller-supplied expirationMs', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const expirationMs = 30 * 60_000
    const before = Date.now()

    const token = await forgotPassword(db, { email: 'user@example.com', expirationMs })

    expect(typeof token).toBe('string')
    expect(token).toHaveLength(40) // randomBytes(20).toString('hex')
    expect(db.rows[0].resetPasswordToken).toBe(token)
    const expiresAtMs = new Date(db.rows[0].resetPasswordExpiration as string).getTime()
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + expirationMs)
    expect(expiresAtMs).toBeLessThanOrEqual(Date.now() + expirationMs + 1_000)
  })

  it('returns null for an unknown email (silent failure, no error) and does not write anything', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const result = await forgotPassword(db, { email: 'nobody@example.com', expirationMs: 60_000 })
    expect(result).toBeNull()
    expect(db.rows[0].resetPasswordToken).toBeNull()
  })

  it('normalizes email the same way login does (case/whitespace insensitive lookup)', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const token = await forgotPassword(db, { email: '  USER@EXAMPLE.COM  ', expirationMs: 60_000 })
    expect(token).not.toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* verifyAuth                                                                  */
/* -------------------------------------------------------------------------- */

function headersFrom(map: Record<string, string>): { get: (name: string) => string | null } {
  return { get: (name: string) => map[name] ?? null }
}

describe('localapi/auth - verifyAuth', () => {
  it('accepts a valid Authorization: Bearer token', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${token}` }), secret: SECRET })

    expect(result.user).not.toBeNull()
    expect(result.user?.id).toBe(1)
    expect(result.user).not.toHaveProperty('hash')
  })

  it('accepts a valid Authorization: JWT token', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `JWT ${token}` }), secret: SECRET })

    expect(result.user?.id).toBe(1)
  })

  it('accepts a valid payload-token cookie', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    const result = await verifyAuth(db, { headers: headersFrom({ Cookie: `some-other=1; payload-token=${token}; another=2` }), secret: SECRET })

    expect(result.user?.id).toBe(1)
  })

  it('returns { user: null } (never throws) when no token is present at all', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const result = await verifyAuth(db, { headers: headersFrom({}), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } for a malformed token', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: 'Bearer not-a-real-jwt' }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } for a tampered signature', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })
    const parts = token.split('.')
    const tamperedSignature = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'A' ? 'B' : 'A')
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSignature}`

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${tampered}` }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } for an expired token', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = signJWT({ id: 1, collection: 'users', email: 'user@example.com', sid: 'whatever' }, SECRET, -60)

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${token}` }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } when signed with the wrong secret', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: 'a-different-secret' })
    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${token}` }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } when the JWT is otherwise valid but its sid is no longer present in the user\'s current sessions array (revoked/pruned session)', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })

    // Simulate the session having been revoked/pruned server-side since the token was issued.
    db.rows[0].sessions = []

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${token}` }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })

  it('returns { user: null } when the user id in the token no longer exists', async () => {
    const db = makeFakeAuthDb([makeUser()])
    const { token } = await login(db, { email: 'user@example.com', password: CORRECT_PASSWORD, secret: SECRET })
    db.rows.length = 0 // user deleted

    const result = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${token}` }), secret: SECRET })
    expect(result).toEqual({ user: null })
  })
})

/* -------------------------------------------------------------------------- */
/* Crypto primitives, in isolation                                            */
/* -------------------------------------------------------------------------- */

describe('localapi/auth - hashPassword / verifyPassword', () => {
  it('a correct password verifies against its own hash', () => {
    const { salt, hash } = hashPassword('hunter2')
    expect(verifyPassword('hunter2', salt, hash)).toBe(true)
  })

  it('a wrong password does not verify', () => {
    const { salt, hash } = hashPassword('hunter2')
    expect(verifyPassword('hunter3', salt, hash)).toBe(false)
  })

  it('the same password with a different salt does not verify (proves the salt is actually used)', () => {
    const { hash } = hashPassword('hunter2')
    const { salt: otherSalt } = hashPassword('unrelated')
    expect(verifyPassword('hunter2', otherSalt, hash)).toBe(false)
  })

  it('produces a fresh random salt each time (two hashes of the same password differ)', () => {
    const a = hashPassword('hunter2')
    const b = hashPassword('hunter2')
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('localapi/auth - signJWT / verifyJWT', () => {
  it('signs and verifies a round trip', () => {
    const { token, iat, exp } = signJWT({ id: 1, collection: 'users', email: 'a@b.com', sid: 'sid-1' }, SECRET)
    const claims = verifyJWT(token, SECRET)
    expect(claims).toEqual({ id: 1, collection: 'users', email: 'a@b.com', sid: 'sid-1', iat, exp })
  })

  it('a tampered signature fails verification', () => {
    const { token } = signJWT({ id: 1 }, SECRET)
    const parts = token.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}xx`
    expect(verifyJWT(tampered, SECRET)).toBeNull()
  })

  it('a tampered payload fails verification (signature no longer matches)', () => {
    const { token } = signJWT({ id: 1, admin: false }, SECRET)
    const [headerB64, , signatureB64] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ id: 1, admin: true, iat: 0, exp: 9_999_999_999 })).toString('base64url')
    expect(verifyJWT(`${headerB64}.${forgedPayload}.${signatureB64}`, SECRET)).toBeNull()
  })

  it('an expired exp fails verification', () => {
    const { token } = signJWT({ id: 1 }, SECRET, -10)
    expect(verifyJWT(token, SECRET)).toBeNull()
  })

  it('rejects a structurally malformed token', () => {
    expect(verifyJWT('only.two.parts.too-many', SECRET)).toBeNull()
    expect(verifyJWT('no-dots-at-all', SECRET)).toBeNull()
  })

  it('rejects a token verified with the wrong secret', () => {
    const { token } = signJWT({ id: 1 }, SECRET)
    expect(verifyJWT(token, 'wrong-secret')).toBeNull()
  })
})
