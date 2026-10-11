/**
 * Attribute filters on the shop listing (`?attr_Colour=Red&attr_Size=M`). Pure, no I/O.
 *
 * Everything is bounded: at most MAX_FILTERS filters, names and values capped in length, and the
 * option list offers at most MAX_OPTION_NAMES attributes with MAX_OPTION_VALUES values each. The
 * listing applies these to the published products it already loaded, so a filter can never widen
 * what a visitor sees beyond published products.
 */

import { resolveAttributes, splitValues, type ProductAttributeRow } from './variations'

export const FILTER_PREFIX = 'attr_'
export const MAX_FILTERS = 5
export const MAX_NAME_LENGTH = 40
export const MAX_VALUE_LENGTH = 60
export const MAX_OPTION_NAMES = 8
export const MAX_OPTION_VALUES = 30

export type AttributeFilters = Record<string, string>

type Params = Record<string, string | string[] | undefined>

export function parseAttributeFilters(params: Params): AttributeFilters {
  const filters: AttributeFilters = {}
  for (const [key, raw] of Object.entries(params)) {
    if (!key.startsWith(FILTER_PREFIX)) continue
    const name = key.slice(FILTER_PREFIX.length).trim()
    const value = (Array.isArray(raw) ? raw[0] : raw)?.trim()
    if (!name || !value || name.length > MAX_NAME_LENGTH || value.length > MAX_VALUE_LENGTH) continue
    if (Object.keys(filters).length >= MAX_FILTERS) break
    filters[name] = value
  }
  return filters
}

type Filterable = { attributes?: ProductAttributeRow[] | null }

/** Every attribute of a product (not just the ones used for variations) as name -> values. */
function attributeMap(product: Filterable): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const attribute of resolveAttributes(product.attributes, false)) map.set(attribute.name.toLowerCase(), attribute.values)
  return map
}

export function matchesAttributeFilters(product: Filterable, filters: AttributeFilters): boolean {
  const names = Object.keys(filters)
  if (names.length === 0) return true
  const map = attributeMap(product)
  return names.every((name) => (map.get(name.toLowerCase()) ?? []).some((value) => value.toLowerCase() === filters[name].toLowerCase()))
}

export type FilterOption = { name: string; values: string[] }

/** The attributes (and their values) found on these products, for the filter links. Bounded. */
export function availableFilterOptions(products: Filterable[]): FilterOption[] {
  const found = new Map<string, { name: string; values: Map<string, string> }>()
  for (const product of products) {
    for (const attribute of resolveAttributes(product.attributes, false)) {
      const key = attribute.name.toLowerCase()
      if (!found.has(key) && found.size >= MAX_OPTION_NAMES) continue
      const entry = found.get(key) ?? { name: attribute.name, values: new Map<string, string>() }
      for (const value of attribute.values) if (entry.values.size < MAX_OPTION_VALUES) entry.values.set(value.toLowerCase(), value)
      found.set(key, entry)
    }
  }
  return [...found.values()].map((entry) => ({ name: entry.name, values: [...entry.values.values()].sort((a, b) => a.localeCompare(b)) })).filter((option) => option.values.length > 0)
}

/** Builds a shop URL with the given category and filters ("" value removes a filter). */
export function filterHref(base: { category?: string }, filters: AttributeFilters, change?: { name: string; value: string | null }): string {
  const next: AttributeFilters = { ...filters }
  if (change) {
    if (change.value === null || next[change.name]?.toLowerCase() === change.value.toLowerCase()) delete next[change.name]
    else next[change.name] = change.value
  }
  const query = new URLSearchParams()
  if (base.category) query.set('category', base.category)
  for (const [name, value] of Object.entries(next)) query.set(`${FILTER_PREFIX}${name}`, value)
  const text = query.toString()
  return text ? `/shop?${text}` : '/shop'
}

export { splitValues }
