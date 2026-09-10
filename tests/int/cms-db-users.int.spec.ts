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
 * Phase 14: Users - `auth: true`, this app's biggest remaining
 * single-collection gap (see ../../src/cms/db/index.ts's Phase 14 doc
 * comment). This data layer never writes `salt`/`hash` itself, so every case
 * here only exercises `email`/`roles` - the two things Users' own `fields`
 * list plus auth's implicit `email` column actually need this data layer to
 * get right.
 */
describe('cms/db - users (proof of concept, not wired in)', () => {
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
})
