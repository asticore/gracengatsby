// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createMembership, deleteMembership, findMembershipByID, updateMembership } from '@/cms/db'

/**
 * Memberships - row-wrapped scalars (the `row` fields are pure layout,
 * flattened onto this table since Phase 3) plus two single-target
 * relationship fields (`user` -> users, `tier` -> membership-tiers), each a
 * plain FK column - the same mechanism EventRSVPs' `event` column proved in
 * Phase 2. createCollectionOps(memberships, Memberships) needs no extra
 * options.
 *
 * This suite only touches rows it creates itself (scoped creates/reads/
 * deletes by id, never an unscoped count or delete) because sibling suites
 * exercise translations/form-submissions/ab-tests against the same local D1
 * database concurrently.
 */
describe('cms/db - memberships (proof of concept, not wired in)', () => {
  let engine: Engine
  let userId: number
  let tierId: number
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()

    const user = await engine.create({
      collection: 'users',
      data: { email: `phase16-memberships-${Date.now()}@example.com`, password: 'Phase16TestPassword!' },
    })
    userId = user.id as number

    const tier = await engine.create({
      collection: 'membership-tiers',
      data: { name: `Phase 16 tier ${Date.now()}` },
    })
    tierId = tier.id as number
  })

  afterAll(async () => {
    for (const id of createdIds) {
      // deleteMembership, not engine.delete: this suite's own writes should
      // be cleaned up by the same code under test.
      await deleteMembership(id)
    }
    // Raw engine.delete for the fixtures - these FKs are ON DELETE SET NULL
    // (see pragma foreign_key_list), so ordering here is not load-bearing,
    // but memberships are deleted first anyway as the sensible order.
    await engine.delete({ collection: 'membership-tiers', id: tierId })
    await engine.delete({ collection: 'users', id: userId })
  })

  it('reads a membership written by Payload, relationship columns and an unset nullable field included', async () => {
    const created = await engine.create({
      collection: 'memberships',
      data: { user: userId, tier: tierId, status: 'active' },
      // renewsAt deliberately left unset.
    })
    createdIds.push(created.id as number)

    const viaOurs = await findMembershipByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.user).toBe(userId)
    expect(viaOurs?.tier).toBe(tierId)
    expect(viaOurs?.status).toBe('active')
    expect(viaOurs?.renewsAt == null).toBe(true)
  })

  it('writes a membership Payload can read back', async () => {
    const ours = await createMembership({ user: userId, tier: tierId, status: 'trialing' })
    createdIds.push(ours.id)

    // depth: 0 - otherwise Payload populates the relationships into the full
    // related documents, which is an API-layer concern, not what the database
    // adapter itself returns (ours returns the raw FK ids, correctly).
    const viaPayload = await engine.findByID({ collection: 'memberships', id: ours.id, depth: 0 })
    const viaPayloadUser = typeof viaPayload.user === 'object' && viaPayload.user !== null ? (viaPayload.user as { id: number }).id : viaPayload.user
    const viaPayloadTier = typeof viaPayload.tier === 'object' && viaPayload.tier !== null ? (viaPayload.tier as { id: number }).id : viaPayload.tier
    expect(viaPayloadUser).toBe(userId)
    expect(viaPayloadTier).toBe(tierId)
    expect(viaPayload.status).toBe('trialing')
  })

  it('updates through the clone adapter and the change round-trips through Payload', async () => {
    const ours = await createMembership({ user: userId, tier: tierId, status: 'pending' })
    createdIds.push(ours.id)

    const renewsAt = new Date().toISOString()
    const updated = await updateMembership(ours.id, { status: 'active', renewsAt })
    expect(updated?.status).toBe('active')
    expect(updated?.renewsAt).toBe(renewsAt)

    const viaPayload = await engine.findByID({ collection: 'memberships', id: ours.id, depth: 0 })
    expect(viaPayload.status).toBe('active')
    expect(viaPayload.renewsAt).toBe(renewsAt)
  })
})
