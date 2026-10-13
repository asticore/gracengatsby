// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { PREORDER_STOCK_MESSAGE, formatShipDate, isPreorderActive, preorderInfo, preorderSummary } from '@/features/ecommerce/lib/preorder'
import { galleryIds, galleryImageId, imageForSelection, keepGalleryVariationImages, orderGallery } from '@/features/ecommerce/lib/variationImage'
import { resolveCartLine, type CatalogueProduct } from '@/features/ecommerce/catalogue'
import { buildProductView } from '@/features/ecommerce/storefront'

const NOW = new Date('2026-10-18T02:00:00Z')
const FUTURE = '2026-11-01T00:00:00.000Z'
const PAST = '2026-10-01T00:00:00.000Z'

describe('pre-order helpers (pure)', () => {
  it('is active only with the flag on and a release date still ahead, or no date', () => {
    expect(isPreorderActive({ preorder: true, preorderReleaseDate: FUTURE }, NOW)).toBe(true)
    expect(isPreorderActive({ preorder: true, preorderReleaseDate: null }, NOW)).toBe(true)
    expect(isPreorderActive({ preorder: true, preorderReleaseDate: PAST }, NOW)).toBe(false)
    expect(isPreorderActive({ preorder: false, preorderReleaseDate: FUTURE }, NOW)).toBe(false)
    expect(isPreorderActive({ preorder: true, preorderReleaseDate: FUTURE }, NOW, false)).toBe(false)
    expect(isPreorderActive(null, NOW)).toBe(false)
  })

  it('stops by itself once the release date has passed', () => {
    const product = { preorder: true, preorderReleaseDate: FUTURE, preorderNote: 'First batch' }
    expect(preorderInfo(product, NOW).active).toBe(true)
    expect(preorderInfo(product, new Date('2026-11-02T00:00:00Z'))).toEqual({ active: false, shipsFrom: null, note: null })
  })

  it('formats the ships-from date in Sydney time and ignores unreadable dates', () => {
    expect(formatShipDate(FUTURE)).toBe('1 November 2026')
    expect(formatShipDate('not a date')).toBeNull()
    expect(formatShipDate(null)).toBeNull()
  })

  it('trims and caps the note, and leaves it out when not active', () => {
    const info = preorderInfo({ preorder: true, preorderNote: `  ${'x'.repeat(600)}  ` }, NOW)
    expect(info.note?.length).toBe(500)
    expect(info.shipsFrom).toBeNull()
    expect(preorderInfo({ preorder: true, preorderReleaseDate: PAST, preorderNote: 'Hi' }, NOW).note).toBeNull()
  })

  it('summarises only the pre-order lines of an order', () => {
    expect(preorderSummary([{ name: 'Mug' }])).toBe('')
    expect(preorderSummary([{ name: 'Mug', preorder: { releaseDate: FUTURE, note: 'Fired in batch 2' } }, { name: 'Cap' }])).toBe(
      'Pre-order: Mug (ships from 1 November 2026): Fired in batch 2.',
    )
    expect(preorderSummary(undefined)).toBe('')
  })
})

describe('cart rules for pre-orders (pure)', () => {
  const base: CatalogueProduct = { id: 1, title: 'Print', priceInAUD: 40, productType: 'simple', manageStock: true, stockQty: 0, backorders: 'no', preorder: true, preorderReleaseDate: FUTURE }

  it('allows an out-of-stock pre-order, and refuses it when the shop-wide switch is off', () => {
    const on = resolveCartLine(base, null, 1, NOW, 0, null, true)
    expect(on.ok).toBe(true)
    if (on.ok) expect(on.preorder).toBe(true)
    expect(resolveCartLine(base, null, 1, NOW, 0, null, false).ok).toBe(false)
    expect(resolveCartLine(base, null, 1, NOW).ok).toBe(true)
  })

  it('refuses an out-of-stock pre-order once its date has passed', () => {
    expect(resolveCartLine({ ...base, preorderReleaseDate: PAST }, null, 1, NOW, 0, null, true).ok).toBe(false)
  })

  it('allows a pre-order variation while its stock is out', () => {
    const product: CatalogueProduct = {
      ...base,
      productType: 'variable',
      manageStock: false,
      variations: [{ id: 'v1', attributeValues: 'Size=M', priceInAUD: 45, manageStock: true, stockQty: 0, backorders: 'no', enabled: true }],
    }
    const line = resolveCartLine(product, 'v1', 1, NOW, 0, null, true)
    expect(line.ok).toBe(true)
  })
})

describe('storefront view of a pre-order', () => {
  const product: CatalogueProduct = { id: 2, title: 'Print', priceInAUD: 40, productType: 'simple', manageStock: true, stockQty: 0, backorders: 'no', preorder: true, preorderReleaseDate: FUTURE }

  it('shows the pre-order state and is purchasable while out of stock', () => {
    const view = buildProductView(product, NOW, new Map())
    expect(view.purchasable).toBe(true)
    expect(view.preorder).toEqual({ active: true, shipsFrom: '1 November 2026', note: null })
    expect(view.stockMessage).toBe(PREORDER_STOCK_MESSAGE)
  })

  it('is not purchasable out of stock when the shop setting is off', () => {
    const view = buildProductView(product, NOW, new Map(), { preorders: false })
    expect(view.purchasable).toBe(false)
    expect(view.preorder.active).toBe(false)
  })
})

describe('variation images (pure)', () => {
  it('reads gallery ids from plain ids or populated objects', () => {
    expect(galleryIds([1, { id: 2 }, null])).toEqual([1, 2])
    expect(galleryImageId({ id: 3 }, [3])).toBe(3)
    expect(galleryImageId(4, [3])).toBeNull()
    expect(galleryImageId(undefined, [3])).toBeNull()
  })

  it('clears variation images that are not in the gallery, without touching the input', () => {
    const input = [
      { id: 'a', image: 1 },
      { id: 'b', image: 9 },
      { id: 'c' },
    ]
    const out = keepGalleryVariationImages(input, [1])
    expect(out.map((v) => v.image)).toEqual([1, null, undefined])
    expect(input[1].image).toBe(9)
  })

  it('moves the chosen gallery image to the front and leaves other orders alone', () => {
    const gallery = [{ id: 1, url: '/a.jpg' }, { id: 2, url: '/b.jpg' }, { id: 3, url: '/c.jpg' }]
    expect(orderGallery(gallery, '/c.jpg').map((i) => i.id)).toEqual([3, 1, 2])
    expect(orderGallery(gallery, '/b.jpg').map((i) => i.id)).toEqual([2, 1, 3])
    expect(orderGallery(gallery, '/a.jpg')).toBe(gallery)
    expect(orderGallery(gallery, null)).toBe(gallery)
    expect(orderGallery(gallery, '/missing.jpg')).toBe(gallery)
  })

  it('finds the image for a complete, case-insensitive choice only', () => {
    const variations = [
      { imageUrl: '/red.jpg', attributes: { Colour: 'Red', Size: 'M' } },
      { imageUrl: null, attributes: { Colour: 'Blue', Size: 'M' } },
    ]
    const options = [{ name: 'Colour' }, { name: 'Size' }]
    expect(imageForSelection(variations, options, { Colour: 'red', Size: 'M' })).toBe('/red.jpg')
    expect(imageForSelection(variations, options, { Colour: 'Red' })).toBeNull()
    expect(imageForSelection(variations, options, { Colour: 'Blue', Size: 'M' })).toBeNull()
    expect(imageForSelection(variations, [], {})).toBeNull()
  })
})
