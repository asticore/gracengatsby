import type { FieldGroupDoc } from '@/fields/customFields/types'

import { buildCatalogue, isSourceCollection } from './catalogue'
import { normalizeSlug } from './config'
import type { DataViewDef } from './types'

/**
 * Checks a view before it is saved. Returns plain-English problems; an empty list means it is fine.
 * The read side never trusts what is stored (resolve.ts drops anything not in the catalogue), so this
 * is about telling the editor early, not about safety.
 */
export function validateDataView(def: Pick<DataViewDef, 'slug' | 'source' | 'kind' | 'data' | 'columns' | 'chart'>, groups: FieldGroupDoc[] | null, rawSlug?: unknown): string[] {
  const problems: string[] = []
  if (typeof rawSlug === 'string' && rawSlug.trim() !== '' && def.slug === null) {
    problems.push('The link name must contain letters, and cannot be only numbers (numbers are used for ids).')
  }
  if (def.source === 'custom-fields') {
    if (!isSourceCollection(def.data.collection)) {
      problems.push('Choose where the data comes from.')
      return problems
    }
    if (groups) {
      const allowed = new Set(buildCatalogue(def.data.collection, groups).map((field) => field.key))
      const unknown = def.columns.filter((column) => !allowed.has(column.key))
      if (unknown.length > 0) problems.push(`These columns cannot be used (they are hidden, private or no longer exist): ${unknown.map((c) => c.key).join(', ').slice(0, 160)}.`)
      const badFilters = def.data.filters.filter((rule) => !allowed.has(rule.field))
      if (badFilters.length > 0) problems.push('A filter uses a field that cannot be used. Remove it or pick another field.')
      if (def.data.sort && !allowed.has(def.data.sort.key)) problems.push('The sort uses a field that cannot be used.')
    }
    if (def.columns.length === 0) problems.push('Choose at least one column to show.')
  }
  return problems
}

export { normalizeSlug }
