import { afterEach, describe, expect, it } from 'vitest'

import { computeOrderTotals } from '@/features/ecommerce/lib/totals'
import { buyLabel, createManifest, loadManifest, type ShipEngine } from '@/features/ecommerce/server/shipments'
import { MockCarrierAdapter } from '@/features/ecommerce/shipping/mock'
import { fetchLiveRates, liveOptionId, normaliseShippingConfig, setAdapterOverride } from '@/features/ecommerce/shipping/registry'

type Doc = Record<string, unknown>

function fakeEngine(seed: { orders: Doc[]; products?: Doc[]; settings: Doc }): ShipEngine & { store: Record<string, Doc[]> } {
  const store: Record<string, Doc[]> = { orders: seed.orders, products: seed.products ?? [], 'shipping-manifests': [] }
  return {
    store,
    findByID: async ({ collection, id }: { collection: string; id: number }) => store[collection]?.find((d) => d.id === id) ?? null,
    find: async ({ collection }: { collection: string }) => ({ docs: store[collection] ?? [] }),
    findGlobal: async ({ slug }: { slug: string }) => (slug === 'shipping-settings' ? seed.settings : {}),
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      const doc = { id: (store[collection]?.length ?? 0) + 1, createdAt: '2026-10-14T00:00:00Z', ...data }
      ;(store[collection] ??= []).push(doc)
      return doc
    },
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => {
      const doc = store[collection].find((d) => d.id === id)!
      Object.assign(doc, data)
      return doc
    },
  } as never
}

const settings = {
  origin: { line1: '1 Warehouse Rd', city: 'Sydney', state: 'NSW', postcode: '2000', country: 'AU' },
  rates: { liveRates: true, handlingFlat: 1, handlingPct: 0, taxable: true },
  carrierAuspost: { enabled: true, testMode: true },
}

afterEach(() => setAdapterOverride('auspost', null))

describe('live rates in totals', () => {
  const line = { key: '0', productId: '1', name: 'Mug', unitCents: 2000, quantity: 1, taxClass: 'standard' as const, categories: [] as string[], requiresShipping: true }
  const base = { lines: [line], address: { country: 'AU', state: 'NSW', postalCode: '2000' }, zones: [] as never[], rates: [] as never[], settings: { pricesIncludeTax: true, enabled: false } as never }

  it('uses a live option when there are no zones, and re-validates the chosen id', () => {
    const live = [{ id: liveOptionId('mock', 'STD'), zoneId: 'live', zoneName: 'Mock', type: 'flat' as const, title: 'Mock Standard', costCents: 900, taxable: false }]
    const ok = computeOrderTotals({ ...base, liveOptions: live, shippingOptionId: 'live:mock:STD', requireShipping: true })
    expect(ok.ok && ok.shippingCents).toBe(900)
    const bad = computeOrderTotals({ ...base, liveOptions: live, shippingOptionId: 'live:mock:EVIL', requireShipping: true })
    expect(bad.ok).toBe(false)
  })

  it('falls back to zone options when live is empty', () => {
    const r = computeOrderTotals({ ...base, liveOptions: [], requireShipping: true })
    expect(r.ok).toBe(true)
  })

  it('fetchLiveRates adds handling and reports failures without throwing', async () => {
    const mock = new MockCarrierAdapter()
    const cfg = normaliseShippingConfig(settings)
    const out = await fetchLiveRates(cfg, { destination: { postcode: '3000', country: 'AU' }, items: [{ quantity: 1, weightKg: 1 }], adapterFor: () => mock })
    expect(out.options[0].costCents).toBe(800 + 360 + 100)
    mock.failWith = 'down'
    const bad = await fetchLiveRates(cfg, { destination: { postcode: '3000', country: 'AU' }, items: [{ quantity: 1, weightKg: 1 }], adapterFor: () => mock })
    expect(bad.options).toEqual([])
    expect(bad.errors[0].message).toBe('down')
  })
})

describe('buy label and manifest', () => {
  const order = (id: number): Doc => ({
    id,
    orderNumber: `100${id}`,
    status: 'processing',
    customerEmail: '',
    shippingAddress: { firstName: 'A', lastName: 'B', addressLine1: '2 Rd', city: 'Perth', state: 'WA', postalCode: '6000', country: 'AU' },
    lineItems: [{ productId: 1, quantity: 1, name: 'Mug' }],
    shippingMethod: { id: 'live:auspost:STD' },
  })

  it('stores tracking, marks a manifest once and prints it', async () => {
    setAdapterOverride('auspost', new MockCarrierAdapter() as never)
    const engine = fakeEngine({ orders: [order(1), order(2)], products: [{ id: 1, weight: 0.5 }], settings })
    const { shipment } = await buyLabel(engine, 1)
    expect(shipment.trackingNumber).toMatch(/^MOCK/)
    expect(engine.store.orders[0].trackingNumber).toBe(shipment.trackingNumber)
    expect(engine.store.orders[0].shippedAt).toBeTruthy()

    await buyLabel(engine, 2)
    const made = await createManifest(engine, [1, 2])
    expect(made.manifest.totals.parcels).toBe(2)
    expect(made.manifest.number).toMatch(/^M-\d{8}-0001$/)
    await expect(createManifest(engine, [1, 2])).rejects.toThrow(/waiting for a manifest/)
    const again = await loadManifest(engine, Number(made.id))
    expect(again?.rows).toHaveLength(2)
  })

  it('refuses a disabled carrier and a missing origin', async () => {
    const off = fakeEngine({ orders: [order(1)], settings: { ...settings, carrierAuspost: { enabled: false } } })
    await expect(buyLabel(off, 1)).rejects.toThrow(/not switched on/)
    const noOrigin = fakeEngine({ orders: [order(1)], settings: { ...settings, origin: {} } })
    await expect(buyLabel(noOrigin, 1)).rejects.toThrow(/ship-from/)
  })
})
