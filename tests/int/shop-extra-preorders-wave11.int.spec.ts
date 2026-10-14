// @vitest-environment node
// The shop-wide pre-order switch (shop-extra-settings global): pure rules, no database.
import { describe, expect, it } from 'vitest'

import { resolveCartLine, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { preordersEnabledFrom } from '@/features/ecommerce/server/shopExtra'
import { buildProductView } from '@/features/ecommerce/storefront'

// Out of stock, but on pre-order: the only way it can be bought is through the pre-order switch.
const preorderProduct = {
  id: 7,
  title: 'Pre-order print',
  productType: 'simple',
  priceInAUD: 40,
  _status: 'published',
  manageStock: true,
  stockQty: 0,
  backorders: 'no',
  preorder: true,
} as unknown as CatalogueProduct

describe('shop-wide pre-order switch', () => {
  it('is on unless the saved value is explicitly off', () => {
    expect(preordersEnabledFrom(undefined)).toBe(true)
    expect(preordersEnabledFrom(null)).toBe(true)
    expect(preordersEnabledFrom({})).toBe(true)
    expect(preordersEnabledFrom({ preordersEnabled: true })).toBe(true)
    expect(preordersEnabledFrom({ preordersEnabled: false })).toBe(false)
  })

  it('lets a pre-order product be added to a cart while on, and refuses it while off', () => {
    const on = resolveCartLine(preorderProduct, null, 1, new Date(), 0, null, true)
    expect(on).toMatchObject({ ok: true, preorder: true, unitPrice: 40 })
    const off = resolveCartLine(preorderProduct, null, 1, new Date(), 0, null, false)
    expect(off).toMatchObject({ ok: false, error: 'This product is out of stock.' })
  })

  it('defaults to on when no switch is passed, as before', () => {
    expect(resolveCartLine(preorderProduct, null, 1)).toMatchObject({ ok: true, preorder: true })
  })

  it('turns the storefront pre-order message off with the switch', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(buildProductView(preorderProduct, now, new Map(), { preorders: true }).preorder.active).toBe(true)
    const off = buildProductView(preorderProduct, now, new Map(), { preorders: false })
    expect(off.preorder.active).toBe(false)
    expect(off.purchasable).toBe(false)
  })
})
