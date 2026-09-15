// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// The "write-both-ways" proof this project's standing discipline requires
// before Stage 2 (src/localapi/auth.ts) can be considered proven correct -
// same pattern as every prior stage's own *-parity.int.spec.ts (operations,
// read-operations): exercises the SAME real, live `getEngine()` (today's
// real-Payload-backed login/resetPassword/forgotPassword/auth) alongside
// src/localapi/auth.ts's own login/resetPassword/forgotPassword/verifyAuth,
// operating on the SAME real `users` table via the SAME real
// src/cms/db/collections/users.ts exports this module's own AuthDbOps
// contract expects a real call site to wire up.
//
// Unlike operations.ts/read-operations.ts's own parity suite - which can run
// the SAME create/update/delete through both implementations on the SAME
// document, since CRUD is (mostly) order-independent - auth operations are
// NOT: a login mutates loginAttempts/lockUntil/sessions on the row it reads,
// so running both implementations against the SAME row would have the
// second one observe state the first one just changed, which is not a
// meaningful parity comparison. Every test below instead creates two
// separate, IDENTICALLY-SEEDED real Payload users - one driven entirely
// through the real `engine.login`/`engine.resetPassword`/
// `engine.forgotPassword`/`engine.auth`, the other entirely through this
// module's own `login`/`resetPassword`/`forgotPassword`/`verifyAuth` - and
// asserts the two produce equivalent outcomes: same thrown/not-thrown error
// class, same resulting loginAttempts/lockUntil progression, same returned
// user shape, same session/JWT behavior. The one place a single row IS
// shared is the cross-implementation JWT round-trip test, which is
// deliberately read-only on both sides (verifying a token, not logging in).
//
// Real Payload's `payload.secret` (what `jwtSign`/`jwtVerify` actually use -
// confirmed by reading `auth/operations/login.js:41`'s destructure of
// `req.payload.secret`, and `payload/dist/index.js:319-322`, which shows
// `payload.secret` is `sha256(config.secret).hex().slice(0, 32)`, NOT the raw
// `ENGAGE_SECRET`/`PAYLOAD_SECRET` env value) is what this file passes as
// `secret` to every one of this module's own functions - `(engine as
// unknown as { secret: string }).secret`, since `Engine` (== real `Payload`)
// exposes it at runtime but the hand-rolled `AuthDbOps`-based module has no
// reason to declare it on its own arg types beyond a plain string.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { deleteUser, findUserAuthRowByID, findUserAuthRowsPaginated, updateUserAuthRow } from '@/cms/db'
import type { AuthDbOps, AuthUserRow } from '@/localapi/auth'
import { AuthenticationError, forgotPassword, InvalidResetToken, LockedAuth, login, MAX_LOGIN_ATTEMPTS, resetPassword, verifyAuth, verifyJWT } from '@/localapi/auth'

const PASSWORD = 'Phase15ParityPassword!'

function makeRealAuthDb(): AuthDbOps {
  return {
    findByEmail: async (email) => {
      const result = await findUserAuthRowsPaginated({ where: { email: { equals: email } }, limit: 1 })
      return (result.docs[0] as unknown as AuthUserRow) ?? null
    },
    findByID: async (id) => (await findUserAuthRowByID(id)) as unknown as AuthUserRow | null,
    findByResetToken: async (token) => {
      const result = await findUserAuthRowsPaginated({
        where: { and: [{ resetPasswordToken: { equals: token } }, { resetPasswordExpiration: { greater_than: new Date().toISOString() } }] },
        limit: 1,
      })
      return (result.docs[0] as unknown as AuthUserRow) ?? null
    },
    updateByID: async (id, data) => (await updateUserAuthRow(id, data)) as unknown as AuthUserRow | null,
  }
}

function headersFrom(map: Record<string, string>): { get: (name: string) => string | null } {
  return { get: (name: string) => map[name] ?? null }
}

describe('localapi/auth parity - real getEngine() vs src/localapi/auth.ts, same real users table', () => {
  let engine: Engine
  let secret: string
  let db: AuthDbOps
  const createdUserIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
    secret = (engine as unknown as { secret: string }).secret
    db = makeRealAuthDb()
  })

  afterAll(async () => {
    for (const id of createdUserIds) await deleteUser(id).catch((): undefined => undefined)
  })

  async function createRealUser(emailPrefix: string): Promise<{ id: number; email: string }> {
    const email = `phase15-${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
    const created = await engine.create({ collection: 'users', data: { email, password: PASSWORD } })
    createdUserIds.push(created.id as number)
    return { id: created.id as number, email }
  }

  it('successful login: both implementations return a token that verifies, and both mint exactly one session on their own row', async () => {
    const real = await createRealUser('login-real')
    const ours = await createRealUser('login-ours')

    const realResult = await engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })
    const ourResult = await login(db, { email: ours.email, password: PASSWORD, secret })

    expect(realResult.user).toBeTruthy()
    expect(ourResult.user).toBeTruthy()
    expect(typeof realResult.token).toBe('string')
    expect(typeof ourResult.token).toBe('string')

    // Real Payload's own token verifies under our verifyJWT (same HS256 compact-JWS wire format).
    const decodedReal = verifyJWT(realResult.token as string, secret)
    expect(decodedReal).not.toBeNull()
    expect(decodedReal?.id).toBe(real.id)
    expect(decodedReal?.collection).toBe('users')
    expect(typeof decodedReal?.sid).toBe('string')

    const realRow = await findUserAuthRowByID(real.id)
    const oursRow = await findUserAuthRowByID(ours.id)
    expect(realRow?.sessions).toHaveLength(1)
    expect(oursRow?.sessions).toHaveLength(1)
    expect(realRow?.sessions?.[0]?.id).toBe(decodedReal?.sid)
  })

  it('wrong password: both implementations throw AuthenticationError and land on loginAttempts=1, lockUntil=null', async () => {
    const real = await createRealUser('wrong-real')
    const ours = await createRealUser('wrong-ours')

    await expect(engine.login({ collection: 'users', data: { email: real.email, password: 'nope' } })).rejects.toThrow()
    await expect(login(db, { email: ours.email, password: 'nope', secret })).rejects.toBeInstanceOf(AuthenticationError)

    const realRow = await findUserAuthRowByID(real.id)
    const oursRow = await findUserAuthRowByID(ours.id)
    expect(realRow?.loginAttempts).toBe(1)
    expect(oursRow?.loginAttempts).toBe(1)
    expect(realRow?.lockUntil).toBeNull()
    expect(oursRow?.lockUntil).toBeNull()
  })

  it('lockout progression: MAX_LOGIN_ATTEMPTS wrong passwords lock both users identically, and the final attempt throws the locked-account error on both sides', async () => {
    const real = await createRealUser('lock-real')
    const ours = await createRealUser('lock-ours')

    for (let attempt = 1; attempt <= MAX_LOGIN_ATTEMPTS - 1; attempt++) {
      await expect(engine.login({ collection: 'users', data: { email: real.email, password: 'nope' } })).rejects.toThrow()
      await expect(login(db, { email: ours.email, password: 'nope', secret })).rejects.toBeInstanceOf(AuthenticationError)

      const realRow = await findUserAuthRowByID(real.id)
      const oursRow = await findUserAuthRowByID(ours.id)
      expect(realRow?.loginAttempts).toBe(attempt)
      expect(oursRow?.loginAttempts).toBe(attempt)
    }

    // The final (5th) wrong attempt trips the lock on both sides - real Payload throws its own
    // LockedAuth class (not asserted by identity here, this repo has no import of it), ours
    // throws this module's own LockedAuth.
    await expect(engine.login({ collection: 'users', data: { email: real.email, password: 'nope' } })).rejects.toThrow()
    await expect(login(db, { email: ours.email, password: 'nope', secret })).rejects.toBeInstanceOf(LockedAuth)

    const realRow = await findUserAuthRowByID(real.id)
    const oursRow = await findUserAuthRowByID(ours.id)
    expect(realRow?.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
    expect(oursRow?.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
    expect(realRow?.lockUntil).not.toBeNull()
    expect(oursRow?.lockUntil).not.toBeNull()

    // A correct password is rejected on both sides while locked, and does not touch loginAttempts.
    await expect(engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })).rejects.toThrow()
    await expect(login(db, { email: ours.email, password: PASSWORD, secret })).rejects.toBeInstanceOf(LockedAuth)
    expect((await findUserAuthRowByID(real.id))?.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
    expect((await findUserAuthRowByID(ours.id))?.loginAttempts).toBe(MAX_LOGIN_ATTEMPTS)
  })

  it('forgotPassword + resetPassword round trip: both implementations mint a usable token, the new password works, the old one no longer does, and the token is single-use', async () => {
    const real = await createRealUser('reset-real')
    const ours = await createRealUser('reset-ours')
    const NEW_PASSWORD = 'Phase15NewPassword!'

    const realToken = await engine.forgotPassword({ collection: 'users', data: { email: real.email }, disableEmail: true, expiration: 30 * 60_000 })
    const ourToken = await forgotPassword(db, { email: ours.email, expirationMs: 30 * 60_000 })

    expect(typeof realToken).toBe('string')
    expect(typeof ourToken).toBe('string')
    expect(ourToken).toHaveLength((realToken as string).length) // both crypto.randomBytes(20).toString('hex') - 40 hex chars

    await engine.resetPassword({ collection: 'users', data: { token: realToken as string, password: NEW_PASSWORD }, overrideAccess: true })
    await resetPassword(db, { token: ourToken as string, password: NEW_PASSWORD, secret })

    // New password now works on both, old password no longer does, on both.
    const realLoginNew = await engine.login({ collection: 'users', data: { email: real.email, password: NEW_PASSWORD } })
    expect(realLoginNew.user).toBeTruthy()
    await expect(engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })).rejects.toThrow()

    const ourLoginNew = await login(db, { email: ours.email, password: NEW_PASSWORD, secret })
    expect(ourLoginNew.user).toBeTruthy()
    await expect(login(db, { email: ours.email, password: PASSWORD, secret })).rejects.toBeInstanceOf(AuthenticationError)

    // Both tokens are single-use - reusing either now fails the same way (invalid/expired).
    await expect(engine.resetPassword({ collection: 'users', data: { token: realToken as string, password: 'irrelevant' }, overrideAccess: true })).rejects.toThrow()
    await expect(resetPassword(db, { token: ourToken as string, password: 'irrelevant', secret })).rejects.toBeInstanceOf(InvalidResetToken)
  })

  it('forgotPassword for an unknown email returns null/silent-failure on both sides (no enumeration)', async () => {
    const unknown = `phase15-nobody-${Date.now()}@example.com`
    const realToken = await engine.forgotPassword({ collection: 'users', data: { email: unknown }, disableEmail: true, expiration: 60_000 }).catch((): null => null)
    const ourToken = await forgotPassword(db, { email: unknown, expirationMs: 60_000 })
    expect(realToken).toBeNull()
    expect(ourToken).toBeNull()
  })

  it('cross-implementation JWT round trip: a token minted by real engine.login verifies via our verifyAuth, and a token minted by our login verifies via real engine.auth', async () => {
    const forReal = await createRealUser('cross-a')
    const forOurs = await createRealUser('cross-b')

    const realLogin = await engine.login({ collection: 'users', data: { email: forReal.email, password: PASSWORD } })
    const ourVerify = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${realLogin.token}` }), secret })
    expect(ourVerify.user).not.toBeNull()
    expect(ourVerify.user?.id).toBe(forReal.id)

    const ourLogin = await login(db, { email: forOurs.email, password: PASSWORD, secret })
    const realVerify = await engine.auth({ headers: headersFrom({ Authorization: `Bearer ${ourLogin.token}` }) as unknown as Headers })
    expect(realVerify.user).toBeTruthy()
    expect((realVerify.user as { id: number } | null)?.id).toBe(forOurs.id)
  })

  it('revoked/pruned session: both implementations reject an otherwise-valid token once its session is removed from the row', async () => {
    const real = await createRealUser('revoke-real')
    const ours = await createRealUser('revoke-ours')

    const realLogin = await engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })
    const ourLogin = await login(db, { email: ours.email, password: PASSWORD, secret })

    await updateUserAuthRow(real.id, { sessions: [] })
    await updateUserAuthRow(ours.id, { sessions: [] })

    const realVerify = await engine.auth({ headers: headersFrom({ Authorization: `Bearer ${realLogin.token}` }) as unknown as Headers })
    const ourVerify = await verifyAuth(db, { headers: headersFrom({ Authorization: `Bearer ${ourLogin.token}` }), secret })

    expect(realVerify.user ?? null).toBeNull()
    expect(ourVerify.user).toBeNull()
  })
})
