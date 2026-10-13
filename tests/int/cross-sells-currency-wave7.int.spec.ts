// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: { crossSellsInCart: true } as Record<string, unknown> | null,
  rows: [] as Array<Record<string, unknown>>,
  finds: 0,
}))

vi.mock('@/engine', () => ({
  getEngine: async () => ({
    findGlobal: async () => state.settings,
    find: async (args: Record<string, unknown>) => {
      state.finds += 1
      const where = args.where as Record<string, any>
      const publishedOnly = Boolean(where.and)
      const ids: number[] = publishedOnly ? where.and[1].id.in : where.id.in
      return {
        docs: state.rows.filter((row) => ids.includes(row.id as number) && (!publishedOnly || row._status === 'published')),
      }
    },
  }),
}))

import { POST } from '@/app/(engage)/api/shop-cross-sells/route'
import { cartProductIds, pickCrossSells, productIdOf } from '@/features/ecommerce/lib/crossSells'
import { formatCents, formatMoney } from '@/features/ecommerce/lib/money'
import { shopCurrency } from '@/features/ecommerce/server/pricing'
import { resetRateLimiter } from '@/features/security/rateLimit'

const product = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Product ${id}`,
  slug: `product-${id}`,
  _status: 'published',
  productType: 'simple',
  priceInAUD: 10 + id,
  manageStock: false,
  stockStatus: 'instock',
  images: [{ id: 900 + id, url: `/media/${id}.jpg` }],
  crossSells: [] as number[],
  ...extra,
})

describe('pickCrossSells (pure)', () => {
  const candidate = (id: number, extra: Partial<{ published: boolean; inStock: boolean }> = {}) => ({ id, published: true, inStock: true, ...extra })

  it('keeps cart order, drops cart items, unpublished and out-of-stock, and stops at four', () => {
    const ids = pickCrossSells({
      cartProductIds: [1, 10],
      sources: [
        { productId: 1, crossSellIds: [2, 3, 4, 5, 6, 99] },
        { productId: 10, crossSellIds: [7, 8] },
      ],
      candidates: [candidate(2, { inStock: false }), candidate(3), candidate(4, { published: false }), candidate(5), candidate(6), candidate(7), candidate(8)],
    })
    expect(ids).toEqual([3, 5, 6, 7])
  })

  it('never returns the same product twice and never returns a cart item', () => {
    const ids = pickCrossSells({
      cartProductIds: [1, 2],
      sources: [
        { productId: 1, crossSellIds: [2, 3, 3] },
        { productId: 2, crossSellIds: [1, 3, 4] },
      ],
      candidates: [candidate(1), candidate(2), candidate(3), candidate(4)],
    })
    expect(ids).toEqual([3, 4])
  })

  it('returns nothing when there are no suggestions, and respects a custom limit', () => {
    expect(pickCrossSells({ cartProductIds: [1], sources: [], candidates: [] })).toEqual([])
    expect(pickCrossSells({ cartProductIds: [1], sources: [{ productId: 1, crossSellIds: [2, 3, 4] }], candidates: [candidate(2), candidate(3), candidate(4)], limit: 2 })).toEqual([2, 3])
  })
})

describe('cart product ids (pure)', () => {
  it('reads bare ids and populated products, in order, without duplicates', () => {
    expect(productIdOf(5)).toBe(5)
    expect(productIdOf({ id: 6 })).toBe(6)
    expect(productIdOf('x')).toBeNull()
    expect(cartProductIds([{ product: 3 }, { product: { id: 1 } }, { product: 3 }, { product: null }])).toEqual([3, 1])
    expect(cartProductIds(undefined)).toEqual([])
  })
})

describe('storefront money (pure)', () => {
  it('formats cents in the given currency, defaulting to AUD', () => {
    expect(formatMoney(2999)).toBe(formatMoney(2999, 'AUD'))
    expect(formatCents(2999)).toBe(formatMoney(2999, 'AUD'))
    expect(formatMoney(2999, 'USD')).not.toBe(formatMoney(2999, 'AUD'))
    expect(formatMoney(2999, 'AUD')).toContain('29.99')
    expect(formatMoney(null)).toBe('-')
  })

  it('reads the shop currency from settings, AUD when missing or malformed', () => {
    expect(shopCurrency({ settings: { currency: 'usd' } })).toBe('USD')
    expect(shopCurrency({ settings: { currency: 'DOLLARS' } })).toBe('AUD')
    expect(shopCurrency({ settings: {} })).toBe('AUD')
  })
})

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/shop-cross-sells', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify(body) }))

describe('POST /api/shop-cross-sells', () => {
  beforeEach(() => {
    resetRateLimiter()
    state.settings = { crossSellsInCart: true }
    state.finds = 0
    state.rows = [
      product(1, { crossSells: [2, 3, 4, 5, 99] }),
      product(10, { crossSells: [6, 7] }),
      product(2, { manageStock: true, stockQty: 0, backorders: 'no' }),
      product(3),
      product(4, { _status: 'draft' }),
      product(5),
      product(6),
      product(7),
    ]
  })

  it('returns [] and does not read products while the toggle is off', async () => {
    state.settings = { crossSellsInCart: false }
    const res = await post({ productIds: [1, 10] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
    expect(state.finds).toBe(0)
  })

  it('returns public card fields only, for published in-stock suggestions not already in the cart', async () => {
    const res = await post({ productIds: [1, 10] })
    expect(res.status).toBe(200)
    const cards = (await res.json()) as Array<Record<string, unknown>>
    expect(cards.map((card) => card.id)).toEqual([3, 5, 6, 7])
    expect(Object.keys(cards[0]).sort()).toEqual(['id', 'image', 'price', 'slug', 'title'])
    expect(cards[0]).toEqual({ id: 3, title: 'Product 3', slug: 'product-3', price: 13, image: '/media/3.jpg' })
  })

  it('rejects a body without a list of ids and returns [] for an empty cart', async () => {
    expect((await post({ productIds: 'nope' })).status).toBe(400)
    expect(await (await post({ productIds: [] })).json()).toEqual([])
  })
})
