/**
 * Variable products: attribute parsing, variation keys and variation generation. Pure, no I/O.
 *
 * A variation's `attributeValues` is a canonical string "Color=Red|Size=M": pairs sorted by
 * attribute name, joined with "|". Attribute names cannot contain "=" or "|" and values cannot
 * contain "|" (the editor separates a value list with "|"), so the encoding round-trips.
 */

import type { Backorders, StockStatus } from './stock'

export const MAX_GENERATED_VARIATIONS = 100

export type ProductAttributeRow = {
  name?: string | null
  /** A global attribute (product-attributes) this row was taken from; its terms fill in empty `values`. */
  attribute?: number | { id: number; name?: string; terms?: Array<{ name?: string | null }> | null } | null
  /** Pipe separated values, e.g. "Red | Blue | Green". */
  values?: string | null
  visible?: boolean | null
  forVariations?: boolean | null
}

export type VariationRow = {
  id?: string
  attributeValues?: string | null
  sku?: string | null
  gtin?: string | null
  priceInAUD?: number | null
  salePrice?: number | null
  saleFrom?: string | null
  saleTo?: string | null
  manageStock?: boolean | null
  stockQty?: number | null
  backorders?: Backorders | null
  stockStatus?: StockStatus | null
  image?: number | { id: number } | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  enabled?: boolean | null
}

export type ResolvedAttribute = { name: string; values: string[] }

const clean = (text: string): string => text.replace(/[|=]/g, ' ').replace(/\s+/g, ' ').trim()

export function splitValues(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of String(text).split('|')) {
    const value = clean(part)
    if (!value || seen.has(value.toLowerCase())) continue
    seen.add(value.toLowerCase())
    out.push(value)
  }
  return out
}

/** Attribute rows to usable `{name, values}` pairs (name present, at least one value, flagged for variations when `onlyVariation`). */
export function resolveAttributes(rows: ProductAttributeRow[] | null | undefined, onlyVariation = true): ResolvedAttribute[] {
  const out: ResolvedAttribute[] = []
  const names = new Set<string>()
  for (const row of rows ?? []) {
    if (onlyVariation && !row.forVariations) continue
    const global = row.attribute && typeof row.attribute === 'object' ? row.attribute : null
    const name = clean(row.name || global?.name || '')
    if (!name || names.has(name.toLowerCase())) continue
    let values = splitValues(row.values)
    if (values.length === 0 && global?.terms) values = splitValues(global.terms.map((term) => term.name ?? '').join('|'))
    if (values.length === 0) continue
    names.add(name.toLowerCase())
    out.push({ name, values })
  }
  return out
}

export function encodeAttributeValues(pairs: Record<string, string>): string {
  return Object.keys(pairs)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `${name}=${pairs[name]}`)
    .join('|')
}

export function decodeAttributeValues(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(text ?? '').split('|')) {
    const at = part.indexOf('=')
    if (at < 1) continue
    out[part.slice(0, at).trim()] = part.slice(at + 1).trim()
  }
  return out
}

/** Case-insensitive comparison key for an `attributeValues` string. */
export const variationKey = (text: string | null | undefined): string => {
  const pairs = decodeAttributeValues(text)
  return Object.keys(pairs)
    .map((name) => [name.toLowerCase(), pairs[name].toLowerCase()] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, value]) => `${name}=${value}`)
    .join('|')
}

export function countCombinations(attributes: ResolvedAttribute[]): number {
  if (attributes.length === 0) return 0
  return attributes.reduce((total, attribute) => total * attribute.values.length, 1)
}

const newId = (): string => {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'v' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export type GenerateResult = {
  variations: VariationRow[]
  added: number
  kept: number
  total: number
  /** True when more combinations exist than `cap` allows. */
  truncated: boolean
}

/**
 * Builds the full variation list for the given attributes: every existing variation is kept as is
 * (so SKUs and prices are never lost), and each combination without one gets a new enabled row.
 * New rows stop at `cap` combinations in total.
 */
export function generateVariations(
  attributes: ResolvedAttribute[],
  existing: VariationRow[] = [],
  cap: number = MAX_GENERATED_VARIATIONS,
): GenerateResult {
  const combos: Array<Record<string, string>> = []
  const total = countCombinations(attributes)
  const build = (index: number, current: Record<string, string>): void => {
    if (combos.length >= cap) return
    if (index === attributes.length) {
      combos.push({ ...current })
      return
    }
    for (const value of attributes[index].values) {
      build(index + 1, { ...current, [attributes[index].name]: value })
      if (combos.length >= cap) return
    }
  }
  if (attributes.length > 0) build(0, {})

  const have = new Set(existing.map((variation) => variationKey(variation.attributeValues)))
  const variations = [...existing]
  let added = 0
  for (const combo of combos) {
    const encoded = encodeAttributeValues(combo)
    if (have.has(variationKey(encoded))) continue
    variations.push({ id: newId(), attributeValues: encoded, enabled: true, manageStock: false, stockStatus: 'instock', backorders: 'no' })
    have.add(variationKey(encoded))
    added++
  }
  return { variations, added, kept: existing.length, total, truncated: total > cap }
}

export function findVariation<T extends { id?: string }>(variations: T[] | null | undefined, id: string | null | undefined): T | null {
  if (!id) return null
  return (variations ?? []).find((variation) => variation.id === id) ?? null
}

/** Which attribute values are chosen on the product page and which variations they still allow. */
export function matchingVariations(variations: VariationRow[], selection: Record<string, string>): VariationRow[] {
  const wanted = Object.entries(selection).filter(([, value]) => value)
  return variations.filter((variation) => {
    if (variation.enabled === false) return false
    const pairs = decodeAttributeValues(variation.attributeValues)
    return wanted.every(([name, value]) => (pairs[name] ?? '').toLowerCase() === value.toLowerCase())
  })
}
