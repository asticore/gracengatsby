// @vitest-environment node
import type { RealEngine as Engine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createAddress, deleteAddress, findAddressByID, updateAddress } from '@/cms/db'

describe('cms/db - addresses (Stage 10 Ecommerce, Layer 1)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteAddress(id)
    }
  })

  it('reads an address written by Payload', async () => {
    const created = await engine.create({
      collection: 'addresses',
      data: {
        addressLine1: '123 Main St',
        city: 'Melbourne',
        country: 'AU',
      },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findAddressByID(created.id as number)
    expect(viaOurs?.addressLine1).toBe('123 Main St')
    expect(viaOurs?.city).toBe('Melbourne')
    expect(viaOurs?.country).toBe('AU')
  })

  it('writes an address Payload can read back', async () => {
    const ours = await createAddress({
      addressLine1: '456 Market St',
      city: 'Sydney',
      country: 'AU',
    })
    createdIds.push(ours.id)

    const viaPayload = await engine.findByID({ collection: 'addresses', id: ours.id })
    expect(viaPayload.addressLine1).toBe('456 Market St')
    expect(viaPayload.city).toBe('Sydney')
    expect(viaPayload.country).toBe('AU')
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

    const viaPayload = await engine.findByID({ collection: 'addresses', id: ours.id })
    expect(viaPayload.city).toBe('Gold Coast')
  })
})
