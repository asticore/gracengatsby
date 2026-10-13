// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { resolveCartLine, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { clampQuantity, quantityError, validateNamedPrice, MAX_NAMED_CENTS } from '@/features/ecommerce/lib/qtyLimits'
import { buildProductView } from '@/features/ecommerce/storefront'

const base: CatalogueProduct = { id: 1, title: 'Print', productType: 'simple', priceInAUD: 20 }

describe('clampQuantity', () => {
  it('keeps the quantity inside min and max', () => {
    expect(clampQuantity(1, { minQty: 3 })).toBe(3)
    expect(clampQuantity(50, { maxQty: 5 })).toBe(5)
    expect(clampQuantity(4, { minQty: 2, maxQty: 6 })).toBe(4)
  })
  it('never goes below 1 and respects stock as an upper bound', () => {
    expect(clampQuantity(0, {})).toBe(1)
    expect(clampQuantity(NaN, { minQty: 2 })).toBe(2)
    expect(clampQuantity(9, { stockQty: 4 })).toBe(4)
    expect(clampQuantity(2.9, {})).toBe(2)
  })
  it('lets the minimum win when the limits contradict each other', () => {
    expect(clampQuantity(5, { minQty: 3, stockQty: 1 })).toBe(3)
  })
})

describe('quantityError', () => {
  it('reports a line below the minimum and a total above the maximum', () => {
    expect(quantityError(1, { minQty: 2 })).toMatch(/at least 2/)
    expect(quantityError(2, { maxQty: 5 }, 6)).toMatch(/at most 5/)
    expect(quantityError(2, { minQty: 1, maxQty: 5 }, 2)).toBeNull()
    expect(quantityError(1, {})).toBeNull()
  })
})

describe('validateNamedPrice', () => {
  it('accepts an amount at or above the minimum', () => {
    expect(validateNamedPrice(1500, { minPrice: 1000 })).toEqual({ ok: true, error: null, cents: 1500 })
    expect(validateNamedPrice(1000, { minPrice: 1000 }).ok).toBe(true)
  })
  it('rejects amounts below the minimum, non-integers, and absurd values', () => {
    expect(validateNamedPrice(999, { minPrice: 1000 }).error).toMatch(/at least \$10\.00/)
    expect(validateNamedPrice(12.5).ok).toBe(false)
    expect(validateNamedPrice(NaN).ok).toBe(false)
    expect(validateNamedPrice('500' as unknown).ok).toBe(false)
    expect(validateNamedPrice(0).ok).toBe(false)
    expect(validateNamedPrice(MAX_NAMED_CENTS + 1).ok).toBe(false)
  })
})

describe('resolveCartLine quantity limits', () => {
  it('refuses a quantity below the minimum or above the maximum in plain English', () => {
    const limited = { ...base, minQty: 2, maxQty: 4 }
    expect(resolveCartLine(limited, null, 1)).toEqual({ ok: false, error: 'You need to order at least 2 of this product.' })
    expect(resolveCartLine(limited, null, 3, new Date(), 2)).toEqual({ ok: false, error: 'You can order at most 4 of this product at a time.' })
    expect(resolveCartLine(limited, null, 3).ok).toBe(true)
  })
  it('ignores the limits when they are blank', () => {
    expect(resolveCartLine({ ...base, minQty: null, maxQty: null }, null, 50).ok).toBe(true)
  })
})

describe('resolveCartLine name your price', () => {
  const named = { ...base, nameYourPrice: true, minPrice: 10, priceInAUD: 25 }
  it('prices the line at the buyer amount when it is valid', () => {
    const line = resolveCartLine(named, null, 1, new Date(), 0, 1500)
    expect(line).toMatchObject({ ok: true, unitPrice: 15 })
  })
  it('refuses a missing or too-low amount, and never falls back to the list price', () => {
    expect(resolveCartLine(named, null, 1)).toMatchObject({ ok: false })
    expect(resolveCartLine(named, null, 1, new Date(), 0, 500)).toMatchObject({ ok: false })
  })
  it('ignores the buyer amount for ordinary products', () => {
    expect(resolveCartLine(base, null, 1, new Date(), 0, 1)).toMatchObject({ ok: true, unitPrice: 20 })
  })
})

describe('buildProductView limits', () => {
  it('exposes limits and the name-your-price settings to the storefront', () => {
    const view = buildProductView({ ...base, minQty: 2, maxQty: 9, nameYourPrice: true, suggestedPrice: 15, minPrice: 5 })
    expect(view.qtyLimits).toEqual({ min: 2, max: 9 })
    expect(view.buyerPrice).toEqual({ enabled: true, suggested: 15, minimum: 5 })
    expect(view.purchasable).toBe(true)
    expect(buildProductView(base).qtyLimits).toEqual({ min: 1, max: null })
    expect(buildProductView(base).buyerPrice.enabled).toBe(false)
  })
})
