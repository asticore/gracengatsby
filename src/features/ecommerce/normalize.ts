/**
 * Save-time normalisation and validation of the catalogue fields on a product. Pure, no I/O.
 */

import { computeStockStatus, type StockFields } from './stock'
import { MAX_GENERATED_VARIATIONS, variationKey, type VariationRow } from './variations'

export type CatalogueError = { path: string; message: string }

type Data = Record<string, unknown>

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Every SKU a product carries: its own and each variation's, trimmed, empty ones dropped. */
export function collectSkus(data: Data): string[] {
  const skus: string[] = []
  if (text(data.sku)) skus.push(text(data.sku))
  for (const variation of (data.variations as VariationRow[] | undefined) ?? []) if (text(variation.sku)) skus.push(text(variation.sku))
  return skus
}

/** SKUs that appear more than once (case-insensitively) in the given list. */
export function duplicateSkus(skus: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const sku of skus) {
    const key = sku.toLowerCase()
    if (seen.has(key)) dupes.add(sku)
    seen.add(key)
  }
  return [...dupes]
}

function checkPrices(item: { priceInAUD?: unknown; salePrice?: unknown; saleFrom?: unknown; saleTo?: unknown }, path: string, errors: CatalogueError[]): void {
  for (const key of ['priceInAUD', 'salePrice'] as const) {
    if (item[key] != null && (!isNum(item[key]) || (item[key] as number) < 0)) errors.push({ path: `${path}${key}`, message: 'Must be zero or more.' })
  }
  if (isNum(item.priceInAUD) && isNum(item.salePrice) && item.salePrice >= item.priceInAUD) errors.push({ path: `${path}salePrice`, message: 'The sale price must be lower than the regular price.' })
  const from = typeof item.saleFrom === 'string' ? Date.parse(item.saleFrom) : NaN
  const to = typeof item.saleTo === 'string' ? Date.parse(item.saleTo) : NaN
  if (Number.isFinite(from) && Number.isFinite(to) && to < from) errors.push({ path: `${path}saleTo`, message: 'The sale must end after it starts.' })
}

/**
 * Applies computed fields (stock status) in place and returns the problems found. `data` is the
 * incoming (merged) document data; fields it does not carry are left alone.
 */
export function normaliseCatalogue(data: Data, selfId?: number | string): CatalogueError[] {
  const errors: CatalogueError[] = []

  for (const key of ['sku', 'gtin']) if (typeof data[key] === 'string') data[key] = (data[key] as string).trim() || null
  if (typeof data.gtin === 'string' && !/^\d{8}$|^\d{12,14}$/.test(data.gtin)) errors.push({ path: 'gtin', message: 'GTIN/UPC/EAN must be 8, 12, 13 or 14 digits.' })

  checkPrices(data, '', errors)
  for (const key of ['weight', 'length', 'width', 'height', 'lowStockThreshold']) {
    if (data[key] != null && (!isNum(data[key]) || (data[key] as number) < 0)) errors.push({ path: key, message: 'Must be zero or more.' })
  }
  if (data.manageStock && data.stockQty != null && !Number.isInteger(data.stockQty)) errors.push({ path: 'stockQty', message: 'Stock must be a whole number.' })
  if (data.manageStock) {
    if (!isNum(data.stockQty)) data.stockQty = 0
    data.stockStatus = computeStockStatus(data as StockFields)
  }

  if (data.productType === 'external' && data.externalUrl != null && !/^https?:\/\/\S+$/i.test(text(data.externalUrl))) {
    errors.push({ path: 'externalUrl', message: 'Enter a full web address starting with http:// or https://.' })
  }

  if (Array.isArray(data.groupedProducts) && selfId != null) {
    const ids = (data.groupedProducts as Array<number | { id: number }>).map((entry) => (typeof entry === 'object' && entry ? entry.id : entry))
    if (ids.some((id) => String(id) === String(selfId))) errors.push({ path: 'groupedProducts', message: 'A product cannot be grouped with itself.' })
  }

  const variations = data.variations as VariationRow[] | undefined
  if (Array.isArray(variations)) {
    if (variations.length > MAX_GENERATED_VARIATIONS) errors.push({ path: 'variations', message: `A product can have at most ${MAX_GENERATED_VARIATIONS} variations.` })
    const keys = new Set<string>()
    variations.forEach((variation, i) => {
      const path = `variations.${i}.`
      if (!text(variation.attributeValues)) errors.push({ path: `${path}attributeValues`, message: 'Choose the attribute values this variation is for, e.g. Color=Red|Size=M.' })
      else {
        const key = variationKey(variation.attributeValues)
        if (keys.has(key)) errors.push({ path: `${path}attributeValues`, message: 'Another variation already has these attribute values.' })
        keys.add(key)
      }
      checkPrices(variation, path, errors)
      if (typeof variation.sku === 'string') variation.sku = variation.sku.trim() || null
      if (typeof variation.gtin === 'string') {
        variation.gtin = variation.gtin.trim() || null
        if (variation.gtin && !/^\d{8}$|^\d{12,14}$/.test(variation.gtin)) errors.push({ path: `${path}gtin`, message: 'GTIN/UPC/EAN must be 8, 12, 13 or 14 digits.' })
      }
      if (variation.manageStock) {
        if (!isNum(variation.stockQty)) variation.stockQty = 0
        variation.stockStatus = computeStockStatus(variation)
      }
    })
    const dupes = duplicateSkus(collectSkus(data))
    if (dupes.length > 0) errors.push({ path: 'sku', message: `SKU "${dupes[0]}" is used more than once on this product.` })
  }
  return errors
}
