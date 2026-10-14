// @vitest-environment node
// Wave 19 (agent B): product recommendations ("customers also bought"). Rules, window, switch and fallback.
import { beforeEach, describe, expect, it } from 'vitest'

import { coPurchaseCounts, pickRecommendations, recommendationMaxFrom } from '@/features/ecommerce/lib/recommendations'
import { clearRecommendationCache, loadCoPurchaseCounts, loadRecommendationSettings, recommendedProducts } from '@/features/ecommerce/server/recommendations'

type Doc = Record<string, unknown> & { id: number }

const NOW = new Date('2026-10-14T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

const orders = [
  { id: 1, status: 'completed', createdAt: daysAgo(10), lineItems: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }] },
  { id: 2, status: 'processing', createdAt: daysAgo(20), lineItems: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 3 }, { productId: 3, quantity: 1 }] },
  { id: 3, status: 'cancelled', createdAt: daysAgo(5), lineItems: [{ productId: 1 }, { productId: 4 }] },
  { id: 4, status: 'completed', createdAt: daysAgo(400), lineItems: [{ productId: 1 }, { productId: 5 }] },
]

const products: Doc[] = [
  { id: 1, title: 'Mug', category: 'physical', _status: 'published', productType: 'simple', stockStatus: 'instock', priceInAUD: 20 },
  { id: 2, title: 'Coaster', category: 'physical', _status: 'published', productType: 'simple', stockStatus: 'instock', priceInAUD: 8 },
  { id: 3, title: 'Tote', category: 'physical', _status: 'published', productType: 'simple', stockStatus: 'instock', priceInAUD: 30 },
  { id: 4, title: 'Sold out', category: 'physical', _status: 'published', productType: 'simple', stockStatus: 'outofstock', priceInAUD: 9 },
  { id: 5, title: 'Draft pal', category: 'physical', _status: 'draft', productType: 'simple', stockStatus: 'instock', priceInAUD: 9 },
  { id: 6, title: 'Same category', category: 'physical', _status: 'published', productType: 'simple', stockStatus: 'instock', priceInAUD: 12 },
  { id: 7, title: 'Digital', category: 'digital', _status: 'published', productType: 'simple', stockStatus: 'instock', priceInAUD: 3 },
  { id: 8, title: 'A bundle', category: 'physical', _status: 'published', productType: 'bundle', stockStatus: 'instock', priceInAUD: 3 },
]

/** A tiny stand-in for the engine's find: honours the where clauses this code uses. */
const engine = {
  findGlobal: async () => ({ recommendationsEnabled: true, recommendationsMax: 4 }),
  find: async (args: { collection: string; where?: Record<string, any>; limit?: number }) => {
    const where = args.where ?? {}
    if (args.collection === 'orders') {
      const since = where.and?.[1]?.createdAt?.greater_than as string
      return { docs: orders.filter((o) => o.createdAt > since && ['processing', 'on-hold', 'completed'].includes(o.status)) }
    }
    let docs = products.slice()
    for (const clause of (where.and ?? [where]) as Array<Record<string, any>>) {
      if (clause._status) docs = docs.filter((p) => p._status === clause._status.equals)
      if (clause.id?.in) docs = docs.filter((p) => clause.id.in.includes(p.id))
      if (clause.id?.not_in) docs = docs.filter((p) => !clause.id.not_in.includes(p.id))
      if (clause.category?.in) docs = docs.filter((p) => clause.category.in.includes(p.category))
    }
    return { docs }
  },
}

beforeEach(() => clearRecommendationCache())

describe('co-purchase rules', () => {
  it('counts a product once per order and pairs it with every other product in that order', () => {
    const counts = coPurchaseCounts([[1, 2, 2], [1, 2], [2, 3]])
    expect(counts.get(1)?.get(2)).toBe(2)
    expect(counts.get(2)?.get(1)).toBe(2)
    expect(counts.get(2)?.get(3)).toBe(1)
    expect(counts.get(1)?.has(1)).toBe(false)
  })

  it('suggests what was bought together first, then the same category, skipping unavailable products', () => {
    const counts = coPurchaseCounts([[1, 2], [1, 2], [1, 3]])
    const candidates = new Map([
      [2, { published: true, inStock: true }],
      [3, { published: true, inStock: false }],
      [4, { published: true, inStock: true }],
      [5, { published: false, inStock: true }],
    ])
    expect(pickRecommendations({ anchorIds: [1], counts, categoryPeerIds: [1, 4, 5], candidates, limit: 4 })).toEqual([2, 4])
    expect(pickRecommendations({ anchorIds: [1], counts, categoryPeerIds: [4], candidates, limit: 1 })).toEqual([2])
  })

  it('keeps the shop setting between 1 and 12, defaulting to 4', () => {
    expect(recommendationMaxFrom(undefined)).toBe(4)
    expect(recommendationMaxFrom('nope')).toBe(4)
    expect(recommendationMaxFrom(0)).toBe(1)
    expect(recommendationMaxFrom(99)).toBe(12)
    expect(recommendationMaxFrom(6.7)).toBe(6)
  })
})

describe('recommendations from orders', () => {
  it('uses paid orders from the last 180 days only', async () => {
    const counts = await loadCoPurchaseCounts(engine as never, NOW)
    // Order 3 was cancelled and order 4 is older than 180 days, so product 4 and 5 never pair with product 1.
    expect(counts.get(1)?.get(2)).toBe(2)
    expect(counts.get(1)?.has(4)).toBe(false)
    expect(counts.get(1)?.has(5)).toBe(false)
  })

  it('is off until the shop switches it on, and is clamped when read', async () => {
    const off = { findGlobal: async () => ({}) }
    expect(await loadRecommendationSettings(off as never)).toEqual({ enabled: false, max: 4 })
    expect(await loadRecommendationSettings(engine as never)).toEqual({ enabled: true, max: 4 })
  })

  it('recommends bought-together products first, then the same category, never bundles or drafts', async () => {
    const picked = await recommendedProducts(engine as never, { anchorIds: [1], categories: ['physical'], limit: 4, now: NOW })
    expect(picked.map((p) => p.id)).toEqual([2, 3, 6])
  })

  it('falls back to the category when nothing was bought with the product', async () => {
    const picked = await recommendedProducts(engine as never, { anchorIds: [7], categories: ['digital'], limit: 4, now: NOW })
    expect(picked).toEqual([])
    const sameCategory = await recommendedProducts(engine as never, { anchorIds: [6], categories: ['physical'], limit: 2, now: NOW })
    expect(sameCategory.map((p) => p.id)).toEqual([1, 2])
  })
})
