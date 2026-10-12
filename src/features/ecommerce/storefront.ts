/**
 * What the product page and listing need from a product, in a plain serialisable shape. Pure, no
 * I/O: the server page builds it once and the client variation picker only reads it. Prices come
 * from `effectivePrice` so the sale schedule applies everywhere the same way.
 */

import { variationLabel, variationPriceFields, type CatalogueProduct } from './catalogue'
import { priceInfo } from './pricing'
import { canPurchase, computeStockStatus, stockMessage, type StockFields, type StockStatus } from './stock'
import { decodeAttributeValues, resolveAttributes, splitValues, type ProductAttributeRow, type VariationRow } from './variations'

export type VariationView = {
  id: string
  attributes: Record<string, string>
  label: string
  price: number | null
  regular: number | null
  onSale: boolean
  stockStatus: StockStatus
  stockMessage: string
  purchasable: boolean
  sku: string | null
  imageUrl: string | null
}

export type ProductView = {
  type: 'simple' | 'variable' | 'grouped' | 'external' | 'giftcard'
  price: number | null
  regular: number | null
  onSale: boolean
  /** Whole-number percentage off while on sale. */
  salePercent: number | null
  priceMin: number | null
  priceMax: number | null
  stockStatus: StockStatus
  stockMessage: string
  purchasable: boolean
  sku: string | null
  /** Attributes to pick from (variable products), in the order they were defined. */
  options: Array<{ name: string; values: string[] }>
  /** Visible attributes that are information only. */
  details: Array<{ name: string; values: string[] }>
  variations: VariationView[]
  external: { url: string; label: string } | null
}

type ProductInput = CatalogueProduct & {
  attributes?: ProductAttributeRow[] | null
  externalUrl?: string | null
  buttonText?: string | null
}

const imageUrlOf = (image: VariationRow['image'], media: Map<number, string>): string | null => {
  if (!image) return null
  if (typeof image === 'object') return (image as { url?: string | null }).url ?? media.get(image.id) ?? null
  return media.get(image) ?? null
}

const percentOff = (regular: number | null, price: number | null): number | null =>
  regular && price !== null && price < regular ? Math.round(((regular - price) / regular) * 100) : null

/** Only http(s) links are ever offered as a Buy button. */
const safeUrl = (url: string | null | undefined): string | null => (url && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : null)

export function buildProductView(product: ProductInput, now: Date = new Date(), media: Map<number, string> = new Map()): ProductView {
  const type = product.productType ?? 'simple'
  const own = priceInfo(product, now)
  const variations: VariationView[] =
    type === 'variable'
      ? (product.variations ?? [])
          .filter((variation) => variation.enabled !== false && variation.id)
          .map((variation) => {
            const stock: StockFields = variation.manageStock ? variation : product.manageStock ? product : variation
            const info = priceInfo(variationPriceFields(product, variation), now)
            return {
              id: variation.id as string,
              attributes: decodeAttributeValues(variation.attributeValues),
              label: variationLabel(variation),
              price: info.price,
              regular: info.regular,
              onSale: info.onSale,
              stockStatus: computeStockStatus(stock),
              stockMessage: stockMessage(stock),
              purchasable: info.price !== null && canPurchase(stock, 1),
              sku: variation.sku || product.sku || null,
              imageUrl: imageUrlOf(variation.image, media),
            }
          })
      : []

  const prices = variations.map((variation) => variation.price).filter((price): price is number => price !== null)
  const options = resolveAttributes(product.attributes).map((attribute) => ({
    name: attribute.name,
    // Only values some enabled variation actually uses can be chosen.
    values: attribute.values.filter((value) => variations.some((variation) => (variation.attributes[attribute.name] ?? '').toLowerCase() === value.toLowerCase())),
  }))
  const details = (product.attributes ?? [])
    .filter((row) => row.visible !== false && !row.forVariations)
    .map((row) => ({
      name: (row.name || (row.attribute && typeof row.attribute === 'object' ? row.attribute.name : '') || '').trim(),
      values: splitValues(row.values) as string[],
    }))
    .filter((row) => row.name && row.values.length > 0)

  const price = type === 'variable' && prices.length > 0 ? Math.min(...prices) : own.price
  return {
    type,
    price,
    regular: own.regular,
    onSale: type === 'variable' ? variations.some((variation) => variation.onSale) : own.onSale,
    salePercent: type === 'variable' ? null : percentOff(own.regular, own.price),
    priceMin: prices.length > 0 ? Math.min(...prices) : own.price,
    priceMax: prices.length > 0 ? Math.max(...prices) : own.price,
    stockStatus: computeStockStatus(product),
    stockMessage: type === 'variable' ? '' : stockMessage(product),
    purchasable: type === 'simple' && own.price !== null && canPurchase(product, 1),
    sku: product.sku || null,
    options: options.filter((option) => option.values.length > 0),
    details,
    variations,
    external: type === 'external' && safeUrl(product.externalUrl) ? { url: safeUrl(product.externalUrl) as string, label: (product.buttonText || 'Buy').slice(0, 40) } : null,
  }
}

/** schema.org Offer(s) for a product view, for JSON-LD. */
export function offersJsonLd(view: ProductView, currency = 'AUD', url?: string): Record<string, unknown> | null {
  if (view.price === null) return null
  const availability = (status: StockStatus): string => (status === 'outofstock' ? 'https://schema.org/OutOfStock' : status === 'onbackorder' ? 'https://schema.org/BackOrder' : 'https://schema.org/InStock')
  if (view.type === 'variable' && view.priceMin !== null && view.priceMax !== null && view.priceMin !== view.priceMax) {
    return { '@type': 'AggregateOffer', priceCurrency: currency, lowPrice: view.priceMin, highPrice: view.priceMax, offerCount: view.variations.length, ...(url ? { url } : {}) }
  }
  return { '@type': 'Offer', priceCurrency: currency, price: view.price, availability: availability(view.stockStatus), ...(url ? { url } : {}) }
}
