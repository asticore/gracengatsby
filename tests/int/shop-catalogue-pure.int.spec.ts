// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { resolveCartLine, priceRange } from '@/features/ecommerce/catalogue'
import { exportProductsCsv, parseProductsCsv, protectCell, productsToRows, unprotectCell, CSV_MAX_DATA_ROWS } from '@/features/ecommerce/csv'
import { availableFilterOptions, matchesAttributeFilters, parseAttributeFilters, MAX_FILTERS } from '@/features/ecommerce/filters'
import { normaliseCatalogue } from '@/features/ecommerce/normalize'
import { effectivePrice, isSaleActive } from '@/features/ecommerce/pricing'
import { aggregateRatingJsonLd, checkReview, summariseRatings } from '@/features/ecommerce/reviews'
import { adjustStock, canPurchase, computeStockStatus, stockMessage } from '@/features/ecommerce/stock'
import { stockAlerts } from '@/features/ecommerce/stockAlerts'
import { buildProductView } from '@/features/ecommerce/storefront'
import { generateVariations, MAX_GENERATED_VARIATIONS, resolveAttributes, variationKey } from '@/features/ecommerce/variations'

describe('effectivePrice', () => {
  const base = { priceInAUD: 100, salePrice: 80, saleFrom: '2026-06-01', saleTo: '2026-06-30' }
  it('uses the sale price only inside the window', () => {
    expect(effectivePrice(base, new Date('2026-05-31T23:59:59Z'))).toBe(100)
    expect(effectivePrice(base, new Date('2026-06-01T00:00:00Z'))).toBe(80)
    expect(effectivePrice(base, new Date('2026-06-30T23:59:59Z'))).toBe(80)
    expect(effectivePrice(base, new Date('2026-07-01T00:00:01Z'))).toBe(100)
  })
  it('runs open ended without dates and ignores a sale that is not lower', () => {
    expect(effectivePrice({ priceInAUD: 10, salePrice: 5 })).toBe(5)
    expect(isSaleActive({ priceInAUD: 10, salePrice: 10 })).toBe(false)
    expect(effectivePrice({ priceInAUD: 10, salePrice: 12 })).toBe(10)
    expect(effectivePrice({})).toBeNull()
  })
})

describe('adjustStock', () => {
  it('sells, restocks and reports threshold crossings without mutating', () => {
    const item = Object.freeze({ manageStock: true, stockQty: 5, lowStockThreshold: 2, backorders: 'no' as const })
    const sold = adjustStock(item, -3)
    expect(sold).toMatchObject({ ok: true, stockQty: 2, becameLow: true, becameOut: false, stockStatus: 'instock' })
    expect(adjustStock({ ...item, stockQty: 1 }, -1)).toMatchObject({ stockQty: 0, becameOut: true, stockStatus: 'outofstock' })
    expect(adjustStock({ ...item, stockQty: 0 }, 4)).toMatchObject({ stockQty: 4, stockStatus: 'instock' })
  })
  it('refuses to oversell unless backorders are allowed', () => {
    expect(adjustStock({ manageStock: true, stockQty: 1, backorders: 'no' }, -2)).toMatchObject({ ok: false, reason: 'insufficient', stockQty: 1, changed: false })
    const allowed = adjustStock({ manageStock: true, stockQty: 1, backorders: 'notify' }, -3)
    expect(allowed).toMatchObject({ ok: true, stockQty: -2, stockStatus: 'onbackorder' })
  })
  it('leaves unmanaged stock alone', () => {
    expect(adjustStock({ manageStock: false, stockStatus: 'instock' }, -9)).toMatchObject({ ok: true, changed: false })
    expect(computeStockStatus({ manageStock: false, stockStatus: 'outofstock' })).toBe('outofstock')
    expect(canPurchase({ manageStock: true, stockQty: 2 }, 3)).toBe(false)
    expect(stockMessage({ manageStock: true, stockQty: 1, lowStockThreshold: 2 })).toBe('Only 1 left in stock')
  })
  it('stockAlerts reports a product and a variation crossing a threshold', () => {
    const before = { title: 'Tee', manageStock: true, stockQty: 5, variations: [{ id: 'a', attributeValues: 'Size=M', manageStock: true, stockQty: 3 }] }
    const after = { ...before, stockQty: 2, variations: [{ id: 'a', attributeValues: 'Size=M', manageStock: true, stockQty: 0 }] }
    expect(stockAlerts(before, after).map((alert) => alert.kind)).toEqual(['low', 'out'])
    expect(stockAlerts(null, after)).toEqual([])
  })
})

describe('variation generation', () => {
  it('builds every combination and keeps existing rows', () => {
    const attributes = resolveAttributes([
      { name: 'Color', values: 'Red | Blue', forVariations: true },
      { name: 'Size', values: 'S|M|L', forVariations: true },
      { name: 'Material', values: 'Cotton', forVariations: false },
    ])
    expect(attributes.map((a) => a.name)).toEqual(['Color', 'Size'])
    const first = generateVariations(attributes)
    expect(first.total).toBe(6)
    expect(first.variations).toHaveLength(6)
    const keep = { ...first.variations[0], sku: 'KEEP-1' }
    const again = generateVariations(attributes, [keep])
    expect(again.added).toBe(5)
    expect(again.variations[0].sku).toBe('KEEP-1')
    expect(new Set(again.variations.map((v) => variationKey(v.attributeValues))).size).toBe(6)
  })
  it('caps generation at 100', () => {
    const values = Array.from({ length: 12 }, (_, i) => `v${i}`).join('|')
    const attributes = resolveAttributes([
      { name: 'A', values, forVariations: true },
      { name: 'B', values, forVariations: true },
    ])
    const result = generateVariations(attributes)
    expect(result.total).toBe(144)
    expect(result.variations).toHaveLength(MAX_GENERATED_VARIATIONS)
    expect(result.truncated).toBe(true)
  })
})

describe('catalogue validation', () => {
  it('flags a GTIN, a sale above price, duplicate variations and duplicate SKUs', () => {
    const data: Record<string, unknown> = {
      sku: 'A',
      gtin: '123',
      priceInAUD: 10,
      salePrice: 12,
      variations: [
        { attributeValues: 'Size=M', sku: 'a' },
        { attributeValues: 'size=m', sku: 'B' },
      ],
    }
    const paths = normaliseCatalogue(data).map((error) => error.path)
    expect(paths).toEqual(expect.arrayContaining(['gtin', 'salePrice', 'variations.1.attributeValues', 'sku']))
  })
  it('computes stock status when stock is managed', () => {
    const data: Record<string, unknown> = { manageStock: true, stockQty: 0, backorders: 'no' }
    expect(normaliseCatalogue(data)).toEqual([])
    expect(data.stockStatus).toBe('outofstock')
  })
})

describe('cart price validation (server side)', () => {
  const product = {
    id: 1,
    title: 'Tee',
    productType: 'variable' as const,
    priceInAUD: 50,
    _status: 'published',
    variations: [
      { id: 'v1', attributeValues: 'Size=M', priceInAUD: 60, manageStock: true, stockQty: 2, backorders: 'no' as const, sku: 'TEE-M' },
      { id: 'v2', attributeValues: 'Size=L', enabled: false },
      { id: 'v3', attributeValues: 'Size=S', salePrice: 30, saleFrom: '2026-01-01', saleTo: '2026-01-31' },
    ],
  }
  it('prices from the database variation, never the client', () => {
    const line = resolveCartLine(product, 'v1', 1)
    expect(line).toMatchObject({ ok: true, unitPrice: 60, sku: 'TEE-M', variationId: 'v1' })
  })
  it('rejects unknown, disabled and out of stock options', () => {
    expect(resolveCartLine(product, 'nope', 1).ok).toBe(false)
    expect(resolveCartLine(product, null, 1).ok).toBe(false)
    expect(resolveCartLine(product, 'v2', 1).ok).toBe(false)
    expect(resolveCartLine(product, 'v1', 3).ok).toBe(false)
    expect(resolveCartLine(product, 'v1', 1, new Date(), 2).ok).toBe(false)
  })
  it('applies the sale schedule at the time of the request', () => {
    expect(resolveCartLine({ ...product, variations: [{ id: 'v', attributeValues: 'Size=S', priceInAUD: 40, salePrice: 30, saleFrom: '2026-01-01', saleTo: '2026-01-31' }] }, 'v', 1, new Date('2026-01-15T00:00:00Z'))).toMatchObject({ unitPrice: 30 })
    expect(resolveCartLine({ ...product, variations: [{ id: 'v', attributeValues: 'Size=S', priceInAUD: 40, salePrice: 30, saleFrom: '2026-01-01', saleTo: '2026-01-31' }] }, 'v', 1, new Date('2026-03-01T00:00:00Z'))).toMatchObject({ unitPrice: 40 })
  })
  it('refuses drafts, grouped and external products, and bad quantities', () => {
    expect(resolveCartLine({ ...product, _status: 'draft' }, 'v1', 1).ok).toBe(false)
    expect(resolveCartLine({ productType: 'grouped', _status: 'published' }, null, 1).ok).toBe(false)
    expect(resolveCartLine({ productType: 'external', priceInAUD: 5 }, null, 1).ok).toBe(false)
    expect(resolveCartLine({ priceInAUD: 5 }, null, 0).ok).toBe(false)
    expect(resolveCartLine({ priceInAUD: 5 }, null, 2)).toMatchObject({ ok: true, unitPrice: 5 })
  })
  it('gives the listing a price range', () => {
    expect(priceRange(product)).toEqual({ min: 50, max: 60 })
  })
  it('builds the page view with a selector and a safe external link', () => {
    const view = buildProductView({ ...product, attributes: [{ name: 'Size', values: 'S|M|L', forVariations: true }] })
    expect(view.options).toEqual([{ name: 'Size', values: ['S', 'M'] }])
    expect(view.variations.map((v) => v.id)).toEqual(['v1', 'v3'])
    expect(buildProductView({ productType: 'external', externalUrl: 'javascript:alert(1)' }).external).toBeNull()
    expect(buildProductView({ productType: 'external', externalUrl: 'https://shop.example/x', buttonText: 'Buy now' }).external).toEqual({ url: 'https://shop.example/x', label: 'Buy now' })
  })
})

describe('product CSV', () => {
  const products = [
    {
      id: 1,
      title: 'Tee',
      slug: 'tee',
      sku: 'TEE',
      productType: 'variable',
      _status: 'published',
      priceInAUD: 50,
      attributes: [{ name: 'Size', values: 'S | M', forVariations: true, visible: true }],
      variations: [{ attributeValues: 'Size=M', sku: 'TEE-M', priceInAUD: 55, manageStock: true, stockQty: -2, enabled: true }],
    },
    { id: 2, title: '=HYPERLINK("http://evil","x")', slug: 'evil', sku: 'EVIL', productType: 'simple', priceInAUD: 9.5, shortDescription: '@SUM(1+1)' },
  ]
  it('round trips through export and import', () => {
    const plan = parseProductsCsv(exportProductsCsv(products))
    expect(plan.errors).toEqual([])
    expect(plan.products.map((p) => p.sku)).toEqual(['TEE', 'EVIL'])
    const tee = plan.products[0]
    expect(tee.data).toMatchObject({ title: 'Tee', productType: 'variable', priceInAUD: 50, published: true })
    expect(tee.variations).toHaveLength(1)
    expect(tee.variations[0]).toMatchObject({ sku: 'TEE-M', priceInAUD: 55, stockQty: -2, attributeValues: 'Size=M' })
    expect(tee.attributes[0]).toMatchObject({ name: 'Size', forVariations: true })
  })
  it('never leaves a formula in a text cell and restores the text on import', () => {
    const rows = productsToRows(products)
    const flat = rows.flat().filter((cell) => /^[=+@\t\r-]/.test(cell) && Number.isNaN(Number(cell)))
    expect(flat).toEqual([])
    const plan = parseProductsCsv(exportProductsCsv(products))
    expect(plan.products[1].data.title).toBe('=HYPERLINK("http://evil","x")')
    expect(plan.products[1].data.shortDescription).toBe('@SUM(1+1)')
    expect(protectCell('+1')).toBe("'+1")
    expect(unprotectCell("'+1")).toBe('+1')
    expect(unprotectCell("'hello")).toBe("'hello")
  })
  it('reports bad rows with line numbers and stays within the row cap', () => {
    const bad = parseProductsCsv('Type,SKU,Name,Regular price,Sale price\nsimple,A,Thing,abc,\nsimple,B,Other,10,12\nsimple,A,Dup,1,\nvariation,,X,1,\n')
    expect(bad.errors.map((error) => error.line)).toEqual(expect.arrayContaining([2, 3, 4, 5]))
    expect(bad.products).toHaveLength(0)
    const many = 'Type,SKU,Name\n' + Array.from({ length: CSV_MAX_DATA_ROWS + 50 }, (_, i) => `simple,S${i},N${i}`).join('\n')
    const capped = parseProductsCsv(many)
    expect(capped.truncated).toBe(true)
    expect(capped.products.length).toBeLessThanOrEqual(CSV_MAX_DATA_ROWS)
  })
})

describe('reviews', () => {
  it('validates input and traps the honeypot', () => {
    expect(checkReview({ product: 1, name: 'Ann', email: 'a@b.co', rating: 5, text: 'Lovely' })).toMatchObject({ ok: true })
    expect(checkReview({ product: 1, name: 'Ann', email: 'a@b.co', rating: 5, text: 'Lovely', website: 'http://spam' })).toEqual({ ok: false, spam: true })
    const bad = checkReview({ product: 0, name: '', email: 'x', rating: 6, text: 'a' })
    expect(bad).toMatchObject({ ok: false, spam: false })
    expect(Object.keys((bad as { errors: object }).errors).sort()).toEqual(['email', 'name', 'product', 'rating', 'text'])
  })
  it('summarises approved reviews only', () => {
    const summary = summariseRatings([
      { rating: 5, status: 'approved' },
      { rating: 4, status: 'approved' },
      { rating: 1, status: 'pending' },
      { rating: 1, status: 'spam' },
    ])
    expect(summary).toEqual({ average: 4.5, count: 2 })
    expect(aggregateRatingJsonLd(summary)).toMatchObject({ '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 2 })
    expect(aggregateRatingJsonLd({ average: null, count: 0 })).toBeNull()
  })
})

describe('attribute filters', () => {
  const tee = { attributes: [{ name: 'Color', values: 'Red|Blue', forVariations: true }] }
  const mug = { attributes: [{ name: 'Color', values: 'Green' }] }
  it('parses a bounded set of filters', () => {
    const params: Record<string, string> = { category: 'apparel' }
    for (let i = 0; i < 10; i++) params[`attr_N${i}`] = 'x'
    params['attr_Long'] = 'y'.repeat(200)
    expect(Object.keys(parseAttributeFilters(params))).toHaveLength(MAX_FILTERS)
    expect(parseAttributeFilters({ attr_Color: ['Red', 'Blue'] })).toEqual({ Color: 'Red' })
  })
  it('matches case-insensitively and lists options', () => {
    expect(matchesAttributeFilters(tee, { color: 'red' })).toBe(true)
    expect(matchesAttributeFilters(mug, { Color: 'Red' })).toBe(false)
    expect(availableFilterOptions([tee, mug])).toEqual([{ name: 'Color', values: ['Blue', 'Green', 'Red'] }])
  })
})
