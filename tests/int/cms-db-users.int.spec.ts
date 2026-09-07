// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createUser, deleteUser, findUserByID, updateUser } from '@/cms/db'

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
})
