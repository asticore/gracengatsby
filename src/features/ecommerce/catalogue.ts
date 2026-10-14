/**
 * Server-side resolution of a cart line from the database copy of a product. Pure, no I/O.
 *
 * The client only ever names a product, an optional variation id and a quantity. Price, stock and
 * purchasability always come from here, never from anything the browser sent.
 */

import { effectivePrice, type PriceFields } from './pricing'
import { canPurchase, computeStockStatus, type StockFields, type StockStatus } from './stock'
import { decodeAttributeValues, findVariation, type VariationRow } from './variations'
import { quantityError, validateNamedPrice } from './lib/qtyLimits'
import { isPreorderActive, type PreorderFields } from './lib/preorder'

export type ProductType = 'simple' | 'variable' | 'grouped' | 'external' | 'giftcard' | 'bundle'

export type CatalogueProduct = PriceFields &
  StockFields &
  PreorderFields & {
    id?: number
    title?: string
    productType?: ProductType | null
    sku?: string | null
    _status?: string | null
    variations?: VariationRow[] | null
    /** Quantity limits per order; null or blank means no limit. */
    minQty?: number | null
    maxQty?: number | null
    /** Buyer types their own price (simple products only). minPrice is whole dollars, like priceInAUD. */
    nameYourPrice?: boolean | null
    minPrice?: number | null
    suggestedPrice?: number | null
  }

export type CartLine =
  | {
      ok: true
      unitPrice: number
      title: string
      sku: string | null
      variationId: string | null
      variationLabel: string | null
      stockStatus: StockStatus
      /** Bought as a pre-order: may be bought while out of stock, ships later. */
      preorder: boolean
    }
  | { ok: false; error: string }

const isPublished = (product: CatalogueProduct): boolean => product._status == null || product._status === 'published'

/** Label such as "Red, M" for a variation. */
export function variationLabel(variation: VariationRow): string {
  return Object.values(decodeAttributeValues(variation.attributeValues)).join(', ')
}

/**
 * Validates and prices one cart line. `alreadyInCart` is the quantity of the same product (or
 * variation) already in the cart, so the stock and maximum checks cover the new total.
 * `priceCents` is the buyer's own amount, used only for name-your-price simple products.
 * `preordersOn` is the shop-wide pre-order switch (on by default).
 */
export function resolveCartLine(
  product: CatalogueProduct | null | undefined,
  variationId: string | null | undefined,
  quantity: number,
  now: Date = new Date(),
  alreadyInCart = 0,
  priceCents: number | null = null,
  preordersOn = true,
): CartLine {
  if (!product || !isPublished(product)) return { ok: false, error: 'This product is not available.' }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return { ok: false, error: 'Invalid quantity.' }
  const type = product.productType ?? 'simple'
  if (type === 'external') return { ok: false, error: 'This product is sold on another site.' }
  if (type === 'grouped') return { ok: false, error: 'Choose one of the products in this group.' }
  // Bundles are priced from their products (server/bundles.ts), never through this single-product path.
  if (type === 'bundle') return { ok: false, error: 'Bundles are priced from the products inside them.' }
  const total = quantity + Math.max(0, alreadyInCart)
  const limitError = quantityError(quantity, product, total)
  if (limitError) return { ok: false, error: limitError }
  const title = product.title || 'Item'
  const preorder = isPreorderActive(product, now, preordersOn)

  if (type === 'variable') {
    const variation = findVariation(product.variations, variationId)
    if (!variation || variation.enabled === false) return { ok: false, error: 'Choose an available option.' }
    // A variation that does not manage its own stock draws on the product's.
    const stock: StockFields = variation.manageStock ? variation : product.manageStock ? product : variation
    if (!canPurchase(stock, total) && !preorder) return { ok: false, error: 'That option is out of stock.' }
    const resolved = effectivePrice(variationPriceFields(product, variation), now)
    if (resolved === null) return { ok: false, error: 'This option has no price.' }
    return {
      ok: true,
      unitPrice: resolved,
      title,
      sku: variation.sku || product.sku || null,
      variationId: variation.id ?? null,
      variationLabel: variationLabel(variation),
      stockStatus: computeStockStatus(stock),
      preorder,
    }
  }

  if (!canPurchase(product, total) && !preorder) return { ok: false, error: 'This product is out of stock.' }
  if (product.nameYourPrice && type === 'simple') {
    // The buyer's amount is checked here against the shop's minimum; the browser's value is never trusted as is.
    const named = validateNamedPrice(priceCents, { minPrice: product.minPrice != null ? Math.floor(product.minPrice * 100 + 1e-9) : null })
    if (!named.ok || named.cents == null) return { ok: false, error: named.error ?? 'Please enter a valid amount.' }
    return { ok: true, unitPrice: named.cents / 100, title, sku: product.sku || null, variationId: null, variationLabel: null, stockStatus: computeStockStatus(product), preorder }
  }
  const price = effectivePrice(product, now)
  if (price === null) return { ok: false, error: 'This product has no price.' }
  return { ok: true, unitPrice: price, title, sku: product.sku || null, variationId: null, variationLabel: null, stockStatus: computeStockStatus(product), preorder }
}

/** The price fields that apply to a variation: its own when it sets any, otherwise the product's. */
export function variationPriceFields(product: PriceFields, variation: VariationRow): PriceFields {
  if (variation.priceInAUD == null && variation.salePrice == null) {
    return { priceInAUD: product.priceInAUD, salePrice: product.salePrice, saleFrom: product.saleFrom, saleTo: product.saleTo }
  }
  return {
    priceInAUD: variation.priceInAUD ?? product.priceInAUD,
    salePrice: variation.salePrice,
    saleFrom: variation.saleFrom,
    saleTo: variation.saleTo,
  }
}

/** The lowest and highest price a variable product can currently sell at (for "From $x" on listings). */
export function priceRange(product: CatalogueProduct, now: Date = new Date()): { min: number | null; max: number | null } {
  if ((product.productType ?? 'simple') !== 'variable') {
    const price = effectivePrice(product, now)
    return { min: price, max: price }
  }
  const prices: number[] = []
  for (const variation of product.variations ?? []) {
    if (variation.enabled === false) continue
    const price = effectivePrice(variationPriceFields(product, variation), now)
    if (price !== null) prices.push(price)
  }
  if (prices.length === 0) {
    const price = effectivePrice(product, now)
    return { min: price, max: price }
  }
  return { min: Math.min(...prices), max: Math.max(...prices) }
}
