// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { labelledOrderOptions, manifestCarrierOptions } from '@/features/ecommerce/server/manifestOptions'

describe('manifestCarrierOptions', () => {
  it('lists only carriers that are switched on and have every key saved', () => {
    const doc = {
      carrierAuspost: { enabled: true, pacKey: 'k', accountNumber: 'a', apiKey: 'k2', apiPassword: 'p' },
      carrierSendle: { enabled: true, sendleId: 'id', apiKey: '' },
      carrierStartrack: { enabled: false, accountNumber: 'a', apiKey: 'k', apiPassword: 'p' },
    }
    const options = manifestCarrierOptions(doc)
    expect(options.map((o) => o.id)).toEqual(['auspost'])
    expect(options[0].label).toBe('Australia Post')
  })

  it('is empty when nothing is configured', () => {
    expect(manifestCarrierOptions({})).toEqual([])
  })
})

describe('labelledOrderOptions', () => {
  it('shows the order number and recipient name, never contact details', () => {
    const options = labelledOrderOptions([
      { id: 12, orderNumber: '1012', shippingAddress: { firstName: 'Alex', lastName: 'Sample', phone: '0400', addressLine1: '1 St' } },
      { id: 13, shippingAddress: null },
      { id: 'bad' },
    ])
    expect(options).toEqual([
      { id: 12, orderNumber: '1012', name: 'Alex Sample' },
      { id: 13, orderNumber: '13', name: 'No name' },
    ])
  })
})
