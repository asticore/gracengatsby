// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createUser, deleteUser, findUserAuthRowByID, findUserByID, updateUser, updateUserAuthRow } from '@/cms/db'

/**
 * Phase 14: Users - `auth: true`, this app's biggest single-collection gap
 * (see ../../src/cms/db/index.ts's Phase 14 doc comment), now cut over into
 * src/engage.config.ts's engageD1Adapter the same way Faqs is (see that
 * file's own doc comment for why Users needed two extra things proven first
 * that no earlier cutover did: atomic `$inc` support in ../../src/cms/db/
 * generic.ts's updateByID, and a real `payload.login()` lockout cycle
 * exercised against this exact dispatch). This data layer never writes
 * `salt`/`hash` itself, so most cases here only exercise `email`/`roles` -
 * the two things Users' own `fields` list plus auth's implicit `email`
 * column actually need this data layer to get right - except the lockout
 * test near the end, which deliberately drives real wrong-password logins to
 * prove the one path capable of locking every admin out of the site if this
 * data layer got it wrong.
 */
describe('cms/db - users (wired into engageD1Adapter)', () => {
  let engine: Engine
  const createdUserIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdUserIds) await deleteUser(id)
  })

  it('reads a user written by Payload, including the default roles', async () => {
    const email = `phase14-a-${Date.now()}@example.com`
    const created = await engine.create({ collection: 'users', data: { email, password: 'Phase14TestPassword!' } })
    createdUserIds.push(created.id as number)

    const viaOurs = await findUserByID(created.id as number)
    expect(viaOurs?.email).toBe(email)
    // Users.roles declares `defaultValue: ['customer']` - confirmed Payload
    // applies it automatically when the caller doesn't set one.
    expect(viaOurs?.roles).toEqual(['customer'])
  })

  it('reads a user with multiple roles, in order, written by Payload', async () => {
    const email = `phase14-b-${Date.now()}@example.com`
    const created = await engine.create({
      collection: 'users',
      data: { email, password: 'Phase14TestPassword!', roles: ['admin', 'customer'] },
    })
    createdUserIds.push(created.id as number)

    const viaOurs = await findUserByID(created.id as number)
    expect(viaOurs?.roles).toEqual(['admin', 'customer'])
  })

  it('writes and updates a user Payload can read back', async () => {
    const email = `phase14-c-${Date.now()}@example.com`
    const ours = await createUser({ email, roles: ['customer'] })
    createdUserIds.push(ours.id)
    expect(ours.roles).toEqual(['customer'])

    const updated = await updateUser(ours.id, { roles: ['admin', 'customer'] })
    expect(updated?.roles).toEqual(['admin', 'customer'])

    const viaPayload = await engine.findByID({ collection: 'users', id: ours.id })
    expect(viaPayload.email).toBe(email)
    expect(viaPayload.roles).toEqual(['admin', 'customer'])
  })

  it('applies the roles defaultValue on create, same as Payload does', async () => {
    const email = `phase14-d-${Date.now()}@example.com`
    const ours = await createUser({ email })
    createdUserIds.push(ours.id)
    expect(ours.roles).toEqual(['customer'])

    const viaPayload = await engine.findByID({ collection: 'users', id: ours.id })
    expect(viaPayload.roles).toEqual(['customer'])
  })

  /**
   * These four exercise UserAuthRow/findUserAuthRowByID/updateUserAuthRow -
   * the wider auth-row shape (hash/salt/lockout columns, `sessions`) added
   * alongside generateAuthSessionsTable, scoped out ahead of a real Users
   * adapter cutover (see engageD1Adapter's own doc comment in
   * src/engage.config.ts for why that cutover itself is not done yet).
   * Unlike every test above, this is not "does our code round-trip a value
   * Payload's Local API create/update path also touches" - it proves this
   * data layer's read/write of the parts of a user row ONLY Payload's own
   * auth code (login, session issuance) ever touches, which needed direct
   * verification rather than inference from the plain create/update tests.
   */

  it('exposes hash/salt/loginAttempts on the full auth row Payload writes for a real password', async () => {
    const email = `phase14-e-${Date.now()}@example.com`
    const created = await engine.create({ collection: 'users', data: { email, password: 'Phase14TestPassword!' } })
    createdUserIds.push(created.id as number)

    const authRow = await findUserAuthRowByID(created.id as number)
    expect(authRow?.email).toBe(email)
    // Payload hashes a supplied `password` into salt/hash synchronously
    // during create - both should already be non-empty strings, not the
    // placeholder/undefined a data layer that never selected these columns
    // would have returned.
    expect(typeof authRow?.salt).toBe('string')
    expect(authRow?.salt?.length).toBeGreaterThan(0)
    expect(typeof authRow?.hash).toBe('string')
    expect(authRow?.hash?.length).toBeGreaterThan(0)
    expect(authRow?.loginAttempts).toBe(0)
    expect(authRow?.sessions).toEqual([])
  })

  it('reads a session written by a real payload.login(), through our own sessions child-table wiring', async () => {
    const email = `phase14-f-${Date.now()}@example.com`
    const password = 'Phase14TestPassword!'
    const created = await engine.create({ collection: 'users', data: { email, password } })
    createdUserIds.push(created.id as number)

    // A real local-API login - exercises Payload's OWN base adapter
    // find/updateOne (this collection is not cut over), including
    // addSessionToUser's `payload.db.updateOne({..., data: user})` full-row
    // session write (see payload/dist/auth/sessions.js).
    await engine.login({ collection: 'users', data: { email, password } })

    const authRow = await findUserAuthRowByID(created.id as number)
    expect(authRow?.sessions).toHaveLength(1)
    const [session] = authRow!.sessions!
    expect(typeof session.id).toBe('string')
    expect(session.id.length).toBeGreaterThan(0)
    expect(typeof session.expiresAt).toBe('string')
    expect(Number.isNaN(new Date(session.expiresAt).getTime())).toBe(false)
  })

  it('writes a session through our own ops without corrupting hash/salt, and leaves updatedAt untouched when explicitly nulled - Payload can still log in afterward and sees the session too', async () => {
    const email = `phase14-g-${Date.now()}@example.com`
    const password = 'Phase14TestPassword!'
    const created = await engine.create({ collection: 'users', data: { email, password } })
    const id = created.id as number
    createdUserIds.push(id)

    const before = await findUserAuthRowByID(id)
    expect(before).not.toBeNull()

    // Mirrors addSessionToUser's own shape: the ENTIRE current row, a
    // session appended, `updatedAt` explicitly nulled - everything except
    // `id`/`createdAt`, which Payload's real call also leaves for the DB
    // layer to resolve from the `id` arg / not touch, respectively.
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = before!
    const newSession = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() }
    const updated = await updateUserAuthRow(id, { ...rest, sessions: [...(rest.sessions ?? []), newSession], updatedAt: null })

    expect(updated?.updatedAt).toBe(before!.updatedAt)
    expect(updated?.hash).toBe(before!.hash)
    expect(updated?.salt).toBe(before!.salt)
    expect(updated?.sessions).toEqual([newSession])

    // Payload's own login, using the SAME hash/salt this write just passed
    // through unchanged - proves the round trip didn't just look equal, it
    // is still a password Payload itself will accept.
    await expect(engine.login({ collection: 'users', data: { email, password } })).resolves.toBeTruthy()

    // Write-both-ways: the session OUR ops wrote, read back through
    // Payload's own real adapter/Local API.
    const viaPayload = await engine.findByID({ collection: 'users', id })
    const sessionIds = (viaPayload.sessions as Array<{ id: string }>).map((s) => s.id)
    expect(sessionIds).toContain(newSession.id)
  })

  /**
   * Proves ../../src/cms/db/generic.ts's applyAtomicIncrements directly,
   * against the EXACT shape Payload's own incrementLoginAttempts.js sends
   * (`{ loginAttempts: { $inc: 1 } }`), before the lockout test below relies
   * on it through a real payload.login() call. Two increments, not one, to
   * confirm each is relative to the CURRENT stored value (a naive
   * implementation that just overwrote the column with `1` every time would
   * pass a single-increment check but fail this one).
   */
  it('increments loginAttempts atomically via Payload\'s own {$inc} marker shape', async () => {
    const email = `phase14-h-${Date.now()}@example.com`
    const created = await createUser({ email })
    createdUserIds.push(created.id)

    const first = await updateUserAuthRow(created.id, { loginAttempts: { $inc: 1 } })
    expect(first?.loginAttempts).toBe(1)

    const second = await updateUserAuthRow(created.id, { loginAttempts: { $inc: 1 } })
    expect(second?.loginAttempts).toBe(2)

    // The increment must not disturb any other column on the same row.
    expect(second?.email).toBe(email)
  })

  /**
   * The test the engageD1Adapter doc comment calls for before Users could be
   * wired in at all: a real `engine.login()` (Payload's own local-strategy
   * login operation, payload/dist/auth/operations/login.js) driven through
   * WRONG passwords until the account locks, then confirmed still rejected
   * even with the CORRECT password while locked - all of it now dispatched
   * through this data layer's own find/findOne/updateOne for `users`, not
   * the real base adapter. Users declares no override, so Payload's real
   * defaults apply: maxLoginAttempts 5, lockTime 600000ms (confirmed by
   * reading payload/dist/collections/config/defaults.js directly).
   *
   * Asserting on loginAttempts/lockUntil read back via findUserAuthRowByID
   * (not just "the login call rejected") is what makes this a genuine proof
   * rather than a coincidence: a completely broken updateOne dispatch (one
   * that silently no-ops, say) would ALSO make every login attempt fail,
   * and could pass a test that only checked "rejects", while never actually
   * exercising the increment/lock write path at all.
   */
  it('locks the account after 5 real failed payload.login() attempts, through our own adapter dispatch', async () => {
    const email = `phase14-i-${Date.now()}@example.com`
    const password = 'Phase14TestPassword!'
    const created = await engine.create({ collection: 'users', data: { email, password } })
    const id = created.id as number
    createdUserIds.push(id)

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(engine.login({ collection: 'users', data: { email, password: 'WrongPassword!' } })).rejects.toThrow()
      const row = await findUserAuthRowByID(id)
      expect(row?.loginAttempts).toBe(attempt)
      expect(row?.lockUntil).toBeFalsy()
    }

    // The 5th wrong attempt crosses maxLoginAttempts (5) - Payload locks the
    // account as part of THIS SAME request (login.js re-checks permission
    // right after incrementing), so this one still rejects, just with the
    // account now locked rather than merely "wrong password".
    await expect(engine.login({ collection: 'users', data: { email, password: 'WrongPassword!' } })).rejects.toThrow()
    const lockedRow = await findUserAuthRowByID(id)
    expect(lockedRow?.loginAttempts).toBe(5)
    expect(lockedRow?.lockUntil).toBeTruthy()
    expect(new Date(lockedRow!.lockUntil!).getTime()).toBeGreaterThan(Date.now())

    // Locked means locked - even the CORRECT password is rejected now
    // (checkLoginPermission runs before password verification).
    await expect(engine.login({ collection: 'users', data: { email, password } })).rejects.toThrow()

    // Not permanently broken: once the lock is cleared (what a real
    // lockTime expiry, or Payload's own unlock endpoint, does under the
    // hood - payload/dist/auth/strategies/local/resetLoginAttempts.js clears
    // the same two columns on the next SUCCESSFUL login), the correct
    // password works again through this same dispatch.
    await updateUserAuthRow(id, { lockUntil: null, loginAttempts: 0 })
    const loggedIn = await engine.login({ collection: 'users', data: { email, password } })
    expect(loggedIn).toBeTruthy()
    const resetRow = await findUserAuthRowByID(id)
    expect(resetRow?.loginAttempts).toBe(0)
    expect(resetRow?.lockUntil).toBeFalsy()
  })

  /**
   * Mirrors tests/int/cms-db-faqs.int.spec.ts's own "cuts over cleanly" test
   * - proves engine.find/update/delete for `users` go through OUR adapter
   * dispatch now, with assertions precise enough (sort order, the updated/
   * deleted document's actual field values) that a wrong intercept can't
   * hide behind a passing test by accident.
   */
  it('cuts over cleanly: engine.find/update/delete for users go through our own adapter', async () => {
    // Lowercase - Payload's own auth email field normalizes to lowercase on
    // write regardless of adapter (canLoginWithEmail/its beforeChange hook),
    // so anything mixed-case here would never round-trip through Payload's
    // own engine.create in the first place.
    const marker = `adaptercutover-${Date.now()}`
    const a = await engine.create({ collection: 'users', data: { email: `${marker}-a@example.com`, password: 'Phase14TestPassword!', roles: ['admin'] } })
    const b = await engine.create({ collection: 'users', data: { email: `${marker}-b@example.com`, password: 'Phase14TestPassword!', roles: ['customer'] } })
    createdUserIds.push(a.id as number, b.id as number)

    // engine.find -> adapter.find -> findUserAuthRowsPaginated.
    const listed = await engine.find({ collection: 'users', where: { email: { like: marker } }, sort: 'email', limit: 10 })
    expect(listed.docs.map((d) => d.email)).toEqual([`${marker}-a@example.com`, `${marker}-b@example.com`])
    expect(listed.totalDocs).toBe(2)

    // engine.update (by id) -> adapter.updateOne -> updateUserAuthRow.
    const updated = await engine.update({ collection: 'users', id: a.id, data: { roles: ['admin', 'customer'] } })
    expect(updated.roles).toEqual(['admin', 'customer'])
    const reread = await findUserByID(a.id as number)
    expect(reread?.roles).toEqual(['admin', 'customer'])

    // engine.delete (by id) -> adapter.deleteOne (resolves id from `where`) -> deleteUser.
    const deletedDoc = await engine.delete({ collection: 'users', id: b.id })
    expect(deletedDoc.email).toBe(`${marker}-b@example.com`)
    expect(await findUserByID(b.id as number)).toBeNull()
    createdUserIds.splice(createdUserIds.indexOf(b.id as number), 1)
  })
})
