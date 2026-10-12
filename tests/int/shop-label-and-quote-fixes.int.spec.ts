// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { computeOrderTotals } from '@/features/ecommerce/lib/totals'
import { buyLabel, type ShipEngine } from '@/features/ecommerce/server/shipments'
import { deliverGiftCard, type StoredValueEngine } from '@/features/ecommerce/server/storedValue'
import { shopCurrency } from '@/features/ecommerce/server/pricing'
import { MockCarrierAdapter } from '@/features/ecommerce/shipping/mock'
import { setAdapterOverride } from '@/features/ecommerce/shipping/registry'

type Doc = Record<string, unknown>

const line = { key: '0', productId: '1', name: 'Mug', unitCents: 2000, quantity: 1, taxClass: 'standard' as const, categories: [] as string[], requiresShipping: true }
const base = { lines: [line], address: { country: 'AU', state: 'NSW', postalCode: '2000' }, zones: [] as never[], rates: [] as never[], settings: { pricesIncludeTax: true, enabled: false } as never }

describe('live rates never turn into free shipping', () => {
  it('fails the quote when live rates are on, none came back and no zone applies', () => {
    const r = computeOrderTotals({ ...base, liveOptions: [], liveRatesOn: true, requireShipping: true })
    expect(r.ok).toBe(false)
  })
  it('still works when live rates are off', () => {
    expect(computeOrderTotals({ ...base, liveOptions: [], liveRatesOn: false, requireShipping: true }).ok).toBe(true)
  })
})

describe('shop currency', () => {
  it('defaults to AUD and honours a valid setting', () => {
    expect(shopCurrency({ settings: {} })).toBe('AUD')
    expect(shopCurrency({ settings: { currency: 'nzd' } })).toBe('NZD')
    expect(shopCurrency({ settings: { currency: 'bad!' } })).toBe('AUD')
  })
})

function shipEngine(order: Doc): ShipEngine & { order: Doc } {
  const settings = { origin: { line1: '1 Rd', city: 'Sydney', postcode: '2000', country: 'AU' }, carrierAuspost: { enabled: true, testMode: true } }
  return {
    order,
    findByID: async ({ collection }: { collection: string }) => (collection === 'orders' ? order : { id: 1, weight: 0.5 }),
    find: async () => ({ docs: [] as Doc[] }),
    findGlobal: async () => settings,
    create: async () => ({}),
    update: async ({ data }: { data: Doc }) => Object.assign(order, data),
  } as never
}
const mkOrder = (status: string): Doc => ({ id: 1, status, orderNumber: '1001', customerEmail: '', shippingAddress: { addressLine1: '2 Rd', city: 'Perth', postalCode: '6000', country: 'AU' }, lineItems: [{ productId: 1, quantity: 1 }], shippingMethod: { id: 'live:auspost:STD' } })

describe('buyLabel guards', () => {
  it('refuses pending, cancelled and refunded orders', async () => {
    setAdapterOverride('auspost', new MockCarrierAdapter() as never)
    for (const status of ['pending', 'cancelled', 'refunded', 'failed']) {
      await expect(buyLabel(shipEngine(mkOrder(status)), 1)).rejects.toThrow(/paid orders/)
    }
    setAdapterOverride('auspost', null)
  })
  it('does not append a shipment with a tracking number already on the order', async () => {
    const mock = new MockCarrierAdapter()
    setAdapterOverride('auspost', mock as never)
    const engine = shipEngine(mkOrder('processing'))
    const { shipment } = await buyLabel(engine, 1)
    ;(engine.order as Doc).shipments = [{ ...shipment }]
    mock.createLabel = (async () => ({ ...shipment, serviceName: 'x', serviceCode: 'STD', trackingNumber: shipment.trackingNumber })) as never
    await buyLabel(engine, 1)
    expect((engine.order.shipments as unknown[]).length).toBe(1)
    setAdapterOverride('auspost', null)
  })
})

describe('deliverGiftCard', () => {
  const engine = { findGlobal: async () => ({}), update: async () => ({}) } as unknown as StoredValueEngine
  it('does not send disabled or expired cards', async () => {
    expect(await deliverGiftCard(engine, { id: 1, status: 'disabled', recipientEmail: 'a@b.co' })).toBe(false)
    expect(await deliverGiftCard(engine, { id: 1, status: 'active', recipientEmail: 'a@b.co', expiresAt: '2000-01-01T00:00:00Z' })).toBe(false)
  })
})
