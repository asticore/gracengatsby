// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'

import { createAddress, deleteAddress, findAddressByID, updateAddress } from '@/cms/db'

// Stage 10 Ecommerce, Layer 1. This used to be a "write-both-ways" proof
// against a live real-Payload engine (create via engine.create, read via
// our own findAddressByID, and vice versa) to prove our own D1/Drizzle
// reader/writer stays byte-compatible with what real Payload's own
// collection config would produce for the same table. shopPlugin() is now
// REMOVED (payload-removal-plan.md: ecommerce cutover) and 'addresses' is
// no longer a real Payload collection at all - engine.create({collection:
// 'addresses', ...}) would now throw APIError: "The collection with slug
// addresses can't be found." There is no real Payload behavior left to
// compare against, so this is now a plain self-consistency test of our own
// createAddress/findAddressByID/updateAddress/deleteAddress implementation
// instead.
describe('cms/db - addresses (Stage 10 Ecommerce, Layer 1)', () => {
  beforeAll(async () => {
    await ensureMigratedLocalDb()
  }, 300_000)

  const createdIds: number[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteAddress(id)
    }
  })

  it('creates an address and reads it back', async () => {
    const ours = await createAddress({
      addressLine1: '123 Main St',
      city: 'Melbourne',
      country: 'AU',
    })
    createdIds.push(ours.id)

    const viaOurs = await findAddressByID(ours.id)
    expect(viaOurs?.addressLine1).toBe('123 Main St')
    expect(viaOurs?.city).toBe('Melbourne')
    expect(viaOurs?.country).toBe('AU')
  })

  it('creates another address and reads it back', async () => {
    const ours = await createAddress({
      addressLine1: '456 Market St',
      city: 'Sydney',
      country: 'AU',
    })
    createdIds.push(ours.id)

    const viaOurs = await findAddressByID(ours.id)
    expect(viaOurs?.addressLine1).toBe('456 Market St')
    expect(viaOurs?.city).toBe('Sydney')
    expect(viaOurs?.country).toBe('AU')
  })

  it('updates an address', async () => {
    const ours = await createAddress({
      addressLine1: '789 King St',
      city: 'Brisbane',
      country: 'AU',
    })
    createdIds.push(ours.id)

    const updated = await updateAddress(ours.id, {
      city: 'Gold Coast',
    })
    expect(updated?.city).toBe('Gold Coast')
    expect(updated?.addressLine1).toBe('789 King St')

    const viaOurs = await findAddressByID(ours.id)
    expect(viaOurs?.city).toBe('Gold Coast')
  })
})
