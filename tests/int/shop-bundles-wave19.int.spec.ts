// @vitest-environment node
// Wave 19 (agent B): product bundles. Pricing, stock draw-down and validation, with a fake product table.
import { describe, expect, it } from 'vitest'

import { bundleComponentRows, bundleErrors, bundleStockLines, bundleUnitCents } from '@/features/ecommerce/lib/bundles'
import { bundleComponentErrors, bundleContentsOf, bundleStorefrontFields, resolveBundle } from '@/features/ecommerce/server/bundles'

type Doc = Record<string, unknown> & { id: number }

const NOW = new Date('2026-10-14T12:00:00Z')

const products: Doc[] = [
  { id: 1, title: 'Soap', productType: 'simple', priceInAUD: 10, manageStock: true, stockQty: 5, backorders: 'no', stockStatus: 'instock', _status: 'published' },
  { id: 2, title: 'Candle', productType: 'simple', priceInAUD: 20, manageStock: false, stockStatus: 'instock', _status: 'published' },
  { id: 3, title: 'Hidden', productType: 'simple', priceInAUD: 5, _status: 'draft' },
  { id: 4, title: 'Inner bundle', productType: 'bundle', priceInAUD: 5, bundleItems: [{ product: 2, quantity: 1 }], _status: 'published' },
  { id: 5, title: 'Named', productType: 'simple', priceInAUD: 5, nameYourPrice: true, _status: 'published' },
]

const engine = {
  findByID: async (args: unknown): Promise<Doc | null> => products.find((p) => p.id === (args as { id: number }).id) ?? null,
}

const bundle = (overrides: Partial<Doc> = {}): Doc => ({
  id: 10,
  title: 'Gift set',
  productType: 'bundle',
  priceInAUD: 50,
  bundlePricing: 'fixed',
  bundleItems: [
    { product: 1, quantity: 2 },
    { product: 2, quantity: 1 },
  ],
  _status: 'published',
  ...overrides,
})

describe('bundle pricing maths', () => {
  it('uses the fixed price, or the contents total less a percentage', () => {
    expect(bundleUnitCents({ pricing: 'fixed', fixedCents: 4500, discountPct: 0, componentCents: 4000 })).toBe(4500)
    expect(bundleUnitCents({ pricing: 'fixed', fixedCents: null, discountPct: 0, componentCents: 4000 })).toBe(4000)
    expect(bundleUnitCents({ pricing: 'percent', fixedCents: 4500, discountPct: 10, componentCents: 4000 })).toBe(3600)
    expect(bundleUnitCents({ pricing: 'percent', fixedCents: null, discountPct: 150, componentCents: 4000 })).toBe(0)
    expect(bundleUnitCents({ pricing: 'percent', fixedCents: null, discountPct: 33.33, componentCents: 1000 })).toBe(667)
  })

  it('merges repeated products and drops rows with no product or a quantity below 1', () => {
    expect(
      bundleComponentRows([
        { product: 1, quantity: 2 },
        { product: { id: 1 }, quantity: 1 },
        { product: null, quantity: 3 },
        { product: 2, quantity: 0 },
      ]),
    ).toEqual([{ productId: 1, quantity: 3 }])
  })

  it('scales stock lines by the number of bundles sold', () => {
    expect(bundleStockLines([{ productId: 1, quantity: 2, title: 'Soap' }], 3)).toEqual([{ productId: 1, quantity: 6, name: 'Soap' }])
  })
})

describe('bundle validation on save', () => {
  it('needs products, refuses to include itself and checks the discount range', () => {
    expect(bundleErrors({ productType: 'bundle', bundleItems: [] }).map((e) => e.message)).toContain('A bundle needs at least one product in it.')
    expect(bundleErrors({ productType: 'bundle', bundleItems: [{ product: 10, quantity: 1 }] }, 10).map((e) => e.message)).toContain('A bundle cannot include itself.')
    expect(bundleErrors({ productType: 'bundle', bundleItems: [{ product: 1, quantity: 1 }], bundleDiscountPercent: 150 }).map((e) => e.path)).toContain('bundleDiscountPercent')
    expect(bundleErrors({ productType: 'bundle', bundleItems: [{ product: 1, quantity: 1 }] })).toEqual([])
    expect(bundleErrors({ productType: 'simple', bundleItems: [] })).toEqual([])
  })

  it('refuses components that are not simple products, or that do not exist', async () => {
    const errors = await bundleComponentErrors(engine, bundle({ bundleItems: [{ product: 4, quantity: 1 }, { product: 99, quantity: 1 }] }))
    expect(errors.map((e) => e.message)).toEqual([expect.stringContaining('Inner bundle'), expect.stringContaining('no longer exists')])
    expect(await bundleComponentErrors(engine, bundle())).toEqual([])
  })
})

describe('resolving a bundle line', () => {
  it('prices a fixed bundle and lists its contents', async () => {
    const result = await resolveBundle(engine, bundle(), 1, NOW, new Map())
    expect(result).toMatchObject({ ok: true, unitCents: 5000, componentCents: 4000 })
    if (result.ok) expect(result.contents).toEqual([{ productId: 1, title: 'Soap', quantity: 2 }, { productId: 2, title: 'Candle', quantity: 1 }])
  })

  it('prices a percentage bundle from the contents total', async () => {
    const result = await resolveBundle(engine, bundle({ bundlePricing: 'percent', bundleDiscountPercent: 10 }), 2, NOW, new Map())
    expect(result).toMatchObject({ ok: true, unitCents: 3600 })
  })

  it('is only as available as its least-stocked component', async () => {
    // Two bundles need four soaps, but only five are in stock, and two are already promised to another cart line.
    expect((await resolveBundle(engine, bundle(), 2, NOW, new Map())).ok).toBe(true)
    expect((await resolveBundle(engine, bundle(), 2, NOW, new Map([['1:', 2]]))).ok).toBe(false)
    expect((await resolveBundle(engine, bundle(), 3, NOW, new Map())).ok).toBe(false)
  })

  it('records what it reserved so a later line sees the stock as taken', async () => {
    const reserved = new Map<string, number>()
    const first = await resolveBundle(engine, bundle(), 2, NOW, reserved)
    expect(first.ok).toBe(true)
    expect(reserved.get('1:')).toBe(4)
    expect(reserved.get('2:')).toBe(2)
  })

  it('refuses components that are unpublished, bundles, or name-your-price', async () => {
    expect((await resolveBundle(engine, bundle({ bundleItems: [{ product: 3, quantity: 1 }] }), 1, NOW, new Map()))).toMatchObject({ ok: false })
    const nested = await resolveBundle(engine, bundle({ bundleItems: [{ product: 4, quantity: 1 }] }), 1, NOW, new Map())
    expect(nested).toMatchObject({ ok: false })
    expect((nested as { error: string }).error).toContain('cannot be sold inside a bundle')
    expect((await resolveBundle(engine, bundle({ bundleItems: [{ product: 5, quantity: 1 }] }), 1, NOW, new Map())).ok).toBe(false)
  })

  it('refuses an empty bundle, a missing price and quantities over the limit', async () => {
    expect((await resolveBundle(engine, bundle({ bundleItems: [] }), 1, NOW, new Map())).ok).toBe(false)
    expect((await resolveBundle(engine, bundle({ priceInAUD: null }), 1, NOW, new Map())).ok).toBe(false)
    expect((await resolveBundle(engine, bundle({ maxQty: 2 }), 3, NOW, new Map())).ok).toBe(false)
  })
})

describe('bundle storefront view and contents', () => {
  it('shows a percentage bundle as its contents total struck through, with the bundle price as the sale price', async () => {
    const view = await bundleStorefrontFields(engine, bundle({ bundlePricing: 'percent', bundleDiscountPercent: 10 }), NOW)
    expect(view).toMatchObject({ priceInAUD: 40, salePrice: 36, stockStatus: 'instock' })
    expect(view.contents).toHaveLength(2)
  })

  it('shows an out-of-stock bundle as unavailable but still lists what is inside', async () => {
    const view = await bundleStorefrontFields(engine, bundle({ bundleItems: [{ product: 1, quantity: 9 }] }), NOW)
    expect(view.stockStatus).toBe('outofstock')
    expect(view.contents).toEqual([{ productId: 1, title: 'Soap', quantity: 9 }])
  })

  it('names a product that no longer exists', async () => {
    expect(await bundleContentsOf(engine, bundle({ bundleItems: [{ product: 77, quantity: 1 }] }))).toEqual([
      { productId: 77, title: 'Item no longer available', quantity: 1 },
    ])
  })
})
