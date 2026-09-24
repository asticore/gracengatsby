// Pure unit tests for Stage 10 Ecommerce Layer 2's cart-specific access
// functions (`@/access/ecommerceAccess`) and `beforeChange` hook
// (`@/features/ecommerce/hooks/cartHooks`) - no DB, no engine, matching the
// "tiny fake satisfying the real interface" style `localapi-rest.int.spec.ts`
// already uses for pure logic that doesn't need one.
import { describe, expect, it, vi } from 'vitest'

import { hasCartSecretAccess, isGuest } from '@/access/ecommerceAccess'
import { beforeChangeCart, cartStatusAfterRead } from '@/features/ecommerce/hooks/cartHooks'

describe('ecommerceAccess - isGuest', () => {
  it('true when there is no req.user', () => {
    expect(isGuest({ req: { user: null } } as never)).toBe(true)
  })

  it('false when a user is signed in', () => {
    expect(isGuest({ req: { user: { id: 1 } } } as never)).toBe(false)
  })
})

describe('ecommerceAccess - hasCartSecretAccess', () => {
  it('false with no ?secret= query param', () => {
    expect(hasCartSecretAccess({ req: { query: {} } } as never)).toBe(false)
  })

  it('a Where matching the given secret when one is present', () => {
    expect(hasCartSecretAccess({ req: { query: { secret: 'abc123' } } } as never)).toEqual({ secret: { equals: 'abc123' } })
  })
})

describe('cartHooks - beforeChangeCart', () => {
  it('generates a secret on create for a cart with no customer', async () => {
    const data: Record<string, unknown> = { items: [] }
    const result = await beforeChangeCart({ data, operation: 'create', req: { payload: { findByID: vi.fn() } } } as never)
    expect(typeof result.secret).toBe('string')
    expect((result.secret as string).length).toBe(40) // 20 bytes, hex-encoded
  })

  it('does not generate a secret for an authenticated (customer-owned) cart', async () => {
    const data: Record<string, unknown> = { items: [], customer: 7 }
    const result = await beforeChangeCart({ data, operation: 'create', req: { payload: { findByID: vi.fn() } } } as never)
    expect(result.secret).toBeUndefined()
  })

  it('does not overwrite an existing secret on update', async () => {
    const data: Record<string, unknown> = { items: [], secret: 'already-set' }
    const result = await beforeChangeCart({ data, operation: 'update', req: { payload: { findByID: vi.fn() } } } as never)
    expect(result.secret).toBe('already-set')
  })

  it('recalculates subtotal from items using each product price, ignoring the posted value', async () => {
    const findByID = vi.fn().mockResolvedValue({ priceInAUD: 25 })
    const data: Record<string, unknown> = { items: [{ product: 5, quantity: 3 }], subtotal: 999999 }
    const result = await beforeChangeCart({ data, operation: 'update', req: { payload: { findByID } } } as never)
    expect(result.subtotal).toBe(75)
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'products', id: 5 }))
  })

  it('sums multiple items and skips one with no product/quantity', async () => {
    const findByID = vi.fn().mockResolvedValue({ priceInAUD: 10 })
    const data: Record<string, unknown> = {
      items: [
        { product: 1, quantity: 2 },
        { product: 2 }, // no quantity - skipped
        { product: { id: 3 }, quantity: 1 },
      ],
    }
    const result = await beforeChangeCart({ data, operation: 'update', req: { payload: { findByID } } } as never)
    expect(result.subtotal).toBe(30)
    expect(findByID).toHaveBeenCalledTimes(2)
  })

  it('zeroes subtotal when items is not an array', async () => {
    const data: Record<string, unknown> = { subtotal: 50 }
    const result = await beforeChangeCart({ data, operation: 'update', req: { payload: { findByID: vi.fn() } } } as never)
    expect(result.subtotal).toBe(0)
  })
})

describe('cartHooks - cartStatusAfterRead', () => {
  it('"purchased" when purchasedAt is set, regardless of createdAt', () => {
    const result = cartStatusAfterRead({ data: { purchasedAt: '2020-01-01T00:00:00.000Z', createdAt: new Date().toISOString() } })
    expect(result).toBe('purchased')
  })

  it('"active" when createdAt is within the last 7 days and no purchasedAt', () => {
    const result = cartStatusAfterRead({ data: { createdAt: new Date().toISOString() } })
    expect(result).toBe('active')
  })

  it('"abandoned" when createdAt is older than 7 days and no purchasedAt', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const result = cartStatusAfterRead({ data: { createdAt: eightDaysAgo } })
    expect(result).toBe('abandoned')
  })

  it('"abandoned" when neither purchasedAt nor createdAt is present', () => {
    expect(cartStatusAfterRead({ data: {} })).toBe('abandoned')
    expect(cartStatusAfterRead({})).toBe('abandoned')
  })
})
