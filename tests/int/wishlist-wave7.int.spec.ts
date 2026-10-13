// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: { storefront: { wishlist: true } } as Record<string, unknown> | null,
  rows: [] as Array<Record<string, unknown>>,
  lastFind: null as Record<string, unknown> | null,
}))

vi.mock('@/engine', () => ({
  getEngine: async () => ({
    findGlobal: async () => state.settings,
    find: async (args: Record<string, unknown>) => {
      state.lastFind = args
      const where = args.where as { and: Array<Record<string, { in?: number[] }>> }
      const ids = where.and[1].id.in ?? []
      return { docs: state.rows.filter((row) => ids.includes(row.id as number)) }
    },
  }),
}))

import { POST } from '@/app/(engage)/api/shop-wishlist-products/route'
import { parseWishlist, serialiseWishlist, toggleWishlist, validateWishlistIds, wishlistEnabled, WISHLIST_MAX } from '@/features/ecommerce/lib/wishlist'
import { wishlistCards } from '@/features/ecommerce/lib/wishlistCards'
import { resetRateLimiter } from '@/features/security/rateLimit'

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/shop-wishlist-products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('wishlist helpers (pure)', () => {
  it('parses a stored list and ignores corrupt JSON', () => {
    expect(parseWishlist('[3,1,3]')).toEqual([3, 1])
    expect(parseWishlist('not json')).toEqual([])
    expect(parseWishlist('{"ids":[1]}')).toEqual([])
    expect(parseWishlist('[1,"2",-4,0,1.5,null,7]')).toEqual([1, 7])
    expect(parseWishlist(null)).toEqual([])
    expect(parseWishlist(undefined)).toEqual([])
  })

  it('serialises a clean list', () => {
    expect(serialiseWishlist([5, 5, 2, -1])).toBe('[5,2]')
  })

  it('toggles an id on and off, newest last', () => {
    const added = toggleWishlist([1, 2], 9)
    expect(added).toEqual([1, 2, 9])
    expect(toggleWishlist(added, 2)).toEqual([1, 9])
  })

  it('caps the list at 100 and keeps the newest', () => {
    const full = Array.from({ length: WISHLIST_MAX }, (_, i) => i + 1)
    const next = toggleWishlist(full, 500)
    expect(next).toHaveLength(WISHLIST_MAX)
    expect(next[next.length - 1]).toBe(500)
    expect(next[0]).toBe(2)
    expect(parseWishlist(JSON.stringify(Array.from({ length: 150 }, (_, i) => i + 1)))).toHaveLength(WISHLIST_MAX)
  })

  it('validates endpoint input', () => {
    expect(validateWishlistIds([4, 4, 9])).toEqual({ ok: true, ids: [4, 9] })
    expect(validateWishlistIds([])).toEqual({ ok: true, ids: [] })
    expect(validateWishlistIds('1,2').ok).toBe(false)
    expect(validateWishlistIds([1.5]).ok).toBe(false)
    expect(validateWishlistIds(['7']).ok).toBe(false)
    expect(validateWishlistIds(Array.from({ length: 101 }, (_, i) => i + 1)).ok).toBe(false)
    expect(validateWishlistIds(Array.from({ length: 100 }, (_, i) => i + 1)).ok).toBe(true)
  })

  it('treats a missing toggle as on and an explicit false as off', () => {
    expect(wishlistEnabled(null)).toBe(true)
    expect(wishlistEnabled({})).toBe(true)
    expect(wishlistEnabled({ storefront: { wishlist: true } })).toBe(true)
    expect(wishlistEnabled({ storefront: { wishlist: false } })).toBe(false)
  })
})

describe('wishlist card projection (endpoint filter logic)', () => {
  const rows = [
    { id: 1, _status: 'published', title: 'Ring', slug: 'ring', priceInAUD: 120, images: [{ id: 8, url: 'https://cdn.example/ring.jpg', secret: 'x' }], email: 'no' },
    { id: 2, _status: 'draft', title: 'Hidden', slug: 'hidden', priceInAUD: 5, images: [] },
    { id: 3, _status: 'published', title: 'Scarf', slug: 'scarf', priceInAUD: 60, images: [1, 2] },
  ]

  it('drops drafts and unknown ids, keeps saved order, returns only safe fields', () => {
    const cards = wishlistCards(rows, [3, 2, 99, 1])
    expect(cards).toEqual([
      { id: 3, title: 'Scarf', slug: 'scarf', price: 60, image: null },
      { id: 1, title: 'Ring', slug: 'ring', price: 120, image: 'https://cdn.example/ring.jpg' },
    ])
    expect(Object.keys(cards[1]).sort()).toEqual(['id', 'image', 'price', 'slug', 'title'])
  })
})

describe('POST /api/shop-wishlist-products', () => {
  beforeEach(() => {
    resetRateLimiter()
    state.settings = { storefront: { wishlist: true } }
    state.rows = [{ id: 1, _status: 'published', title: 'Ring', slug: 'ring', priceInAUD: 120, images: [] }, { id: 2, _status: 'draft', title: 'Hidden', slug: 'hidden', priceInAUD: 5, images: [] }]
    state.lastFind = null
  })

  it('returns published cards and forces published status into the query', async () => {
    const response = await post({ ids: [2, 1] })
    expect(response.status).toBe(200)
    const data = (await response.json()) as { products: Array<{ id: number }> }
    expect(data.products.map((p) => p.id)).toEqual([1])
    const and = (state.lastFind?.where as { and: unknown[] }).and
    expect(and[0]).toEqual({ _status: { equals: 'published' } })
  })

  it('rejects bad input with 400', async () => {
    expect((await post({ ids: 'abc' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ ids: [1, 'x'] })).status).toBe(400)
  })

  it('returns 404 when the wishlist toggle is off', async () => {
    state.settings = { storefront: { wishlist: false } }
    expect((await post({ ids: [1] })).status).toBe(404)
  })
})
