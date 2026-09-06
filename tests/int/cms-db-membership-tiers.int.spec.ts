// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createMembershipTier, deleteMembershipTier, findMembershipTierByID, updateMembershipTier } from '@/cms/db'

/**
 * Same write-both-ways parity shape as the earlier suites, proving the two
 * additions in src/cms/db/schema/generate.ts: row-wrapped fields (name,
 * active, price, interval, trialDays are all inside `row` wrappers on
 * MembershipTiers - see src/features/members/collections/MembershipTiers.ts)
 * flatten onto the same table, and the `benefits` array field round-trips
 * through its own child table (eg_membership_tiers_benefits) both ways.
 */
describe('cms/db - membership-tiers (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteMembershipTier(id)
    }
  })

  it('reads a tier written by Payload, row-wrapped fields and array included', async () => {
    const created = await engine.create({
      collection: 'membership-tiers',
      data: {
        name: 'Gold',
        active: true,
        rank: 30,
        price: 25,
        interval: 'monthly',
        benefits: [{ benefit: 'Priority seating' }, { benefit: 'Free coffee' }],
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findMembershipTierByID(created.id as number)
    expect(viaOurs).not.toBeNull()
    expect(viaOurs?.name).toBe('Gold')
    expect(viaOurs?.active).toBe(true)
    expect(viaOurs?.price).toBe(25)
    expect(viaOurs?.interval).toBe('monthly')
    expect(viaOurs?.benefits?.map((b) => b.benefit)).toEqual(['Priority seating', 'Free coffee'])
  })

  it('writes a tier (with an array) Payload can read back', async () => {
    const ours = await createMembershipTier({
      name: 'Written by clone adapter',
      rank: 40,
      benefits: [{ benefit: 'Clone benefit A' }, { benefit: 'Clone benefit B' }],
    })
    createdIds.push(ours.id)
    expect(ours.benefits?.map((b) => b.benefit)).toEqual(['Clone benefit A', 'Clone benefit B'])

    const viaPayload = await engine.findByID({ collection: 'membership-tiers', id: ours.id })
    expect(viaPayload.name).toBe('Written by clone adapter')
    expect((viaPayload.benefits as { benefit?: string }[])?.map((b) => b.benefit)).toEqual(['Clone benefit A', 'Clone benefit B'])
  })

  it('replaces the array on update', async () => {
    const ours = await createMembershipTier({ name: 'Temp', rank: 1, benefits: [{ benefit: 'Original' }] })
    createdIds.push(ours.id)

    const updated = await updateMembershipTier(ours.id, { benefits: [{ benefit: 'Replaced A' }, { benefit: 'Replaced B' }] })
    expect(updated?.benefits?.map((b) => b.benefit)).toEqual(['Replaced A', 'Replaced B'])

    const viaPayload = await engine.findByID({ collection: 'membership-tiers', id: ours.id })
    expect((viaPayload.benefits as { benefit?: string }[])?.map((b) => b.benefit)).toEqual(['Replaced A', 'Replaced B'])
  })

  it('cascades the array rows on delete', async () => {
    const ours = await createMembershipTier({ name: 'To delete', rank: 1, benefits: [{ benefit: 'Gone soon' }] })

    const deleted = await deleteMembershipTier(ours.id)
    expect(deleted).toBe(true)

    const afterDelete = await findMembershipTierByID(ours.id)
    expect(afterDelete).toBeNull()
  })
})
