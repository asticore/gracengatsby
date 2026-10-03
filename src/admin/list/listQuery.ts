/**
 * Pure query builder and state management for the admin collection list.
 * No React, no server imports - can be used in both client and server contexts.
 */

import type { Field } from '@/engine'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type ListFilter = {
  field: string
  op: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'
  value: string
}

export type ListState = {
  q: string
  sort: string
  page: number
  limit: number
  filters: ListFilter[]
  cols: string[] | null
  view: string | null
}

export type ColumnDef = {
  name: string
  label: string
  type: string
  sortable: boolean
  filterable: boolean
  options?: { label: string; value: string }[]
}

export type CollectionListDefaults = {
  columns: string[]
  searchFields: string[]
  sort: string
  limit: number
}

/* -------------------------------------------------------------------------- */
/* Parsing & Serialization                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Parse URL search params into a ListState.
 * Supports: q, sort, page (>=1), limit (10|25|50|100), f (field:op:value), cols (comma-list), view
 */
export function parseListSearchParams(sp: Record<string, string | string[] | undefined>): ListState {
  // q
  const q = typeof sp.q === 'string' ? sp.q : ''

  // sort
  const sort = typeof sp.sort === 'string' ? sp.sort : ''

  // page
  const pageVal = parseInt(typeof sp.page === 'string' ? sp.page : '1', 10)
  const page = Math.max(1, isNaN(pageVal) ? 1 : pageVal)

  // limit - whitelist
  const limitVal = parseInt(typeof sp.limit === 'string' ? sp.limit : '25', 10)
  const limit = [10, 25, 50, 100].includes(limitVal) ? limitVal : 25

  // filters from repeated 'f' param (field:op:value)
  const filters: ListFilter[] = []
  const fParams = Array.isArray(sp.f) ? sp.f : sp.f ? [sp.f] : []
  const validOps = new Set(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists'])

  for (const f of fParams) {
    if (typeof f !== 'string') continue
    const colonIdx1 = f.indexOf(':')
    if (colonIdx1 < 0) continue
    const colonIdx2 = f.indexOf(':', colonIdx1 + 1)
    if (colonIdx2 < 0) continue

    const field = f.slice(0, colonIdx1)
    const op = f.slice(colonIdx1 + 1, colonIdx2) as ListFilter['op']
    const value = f.slice(colonIdx2 + 1)

    if (validOps.has(op)) {
      filters.push({ field, op, value })
    }
  }

  // cols - comma-separated list
  const colsStr = typeof sp.cols === 'string' ? sp.cols : null
  const cols = colsStr ? colsStr.split(',').filter((c) => c.length > 0) : null

  // view
  const view = typeof sp.view === 'string' ? sp.view : null

  return { q, sort, page, limit, filters, cols, view }
}

/**
 * Serialize ListState to query string (no leading ?).
 * Omits defaults: page 1, limit 25, empty q/sort/filters, null cols/view.
 * Resets page to 1 when q/sort/filters/limit change (unless page in overrides).
 */
export function serializeListState(state: ListState, overrides?: Partial<ListState>): string {
  const merged = { ...state, ...overrides }

  // Determine if we should reset page (unless overrides explicitly set it)
  let page = merged.page
  if (!overrides?.page) {
    const qChanged = merged.q !== state.q
    const sortChanged = merged.sort !== state.sort
    const filtersChanged =
      merged.filters.length !== state.filters.length ||
      merged.filters.some(
        (f, i) =>
          state.filters[i]?.field !== f.field || state.filters[i]?.op !== f.op || state.filters[i]?.value !== f.value,
      )
    const limitChanged = merged.limit !== state.limit
    if (qChanged || sortChanged || filtersChanged || limitChanged) {
      page = 1
    }
  }

  const parts: string[] = []

  if (merged.q) parts.push(`q=${encodeURIComponent(merged.q)}`)
  if (merged.sort) parts.push(`sort=${encodeURIComponent(merged.sort)}`)
  if (page > 1) parts.push(`page=${page}`)
  if (merged.limit !== 25) parts.push(`limit=${merged.limit}`)

  for (const f of merged.filters) {
    parts.push(`f=${encodeURIComponent(`${f.field}:${f.op}:${f.value}`)}`)
  }

  if (merged.cols !== null && merged.cols.length > 0) {
    parts.push(`cols=${encodeURIComponent(merged.cols.join(','))}`)
  }
  if (merged.view !== null) {
    parts.push(`view=${encodeURIComponent(merged.view)}`)
  }

  return parts.join('&')
}

/* -------------------------------------------------------------------------- */
/* Column Derivation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Flatten nested field structures (row/collapsible/tabs) and collect top-level fields.
 * Skip groups, arrays, blocks, richText, json, password, and hidden fields.
 */
function flattenFieldsForColumns(fields: Field[]): Field[] {
  const result: Field[] = []

  for (const field of fields) {
    // Skip hidden fields
    if (field.hidden || field.admin?.hidden) continue

    // Skip container types with their nested fields
    if (field.type === 'group' || field.type === 'array' || field.type === 'blocks') continue

    // Skip non-filterable types
    if (field.type === 'richText' || field.type === 'json') continue

    // Descend into row/collapsible/tabs without a name
    if ((field.type === 'row' || field.type === 'collapsible') && !field.name) {
      if ('fields' in field && Array.isArray(field.fields)) {
        result.push(...flattenFieldsForColumns(field.fields))
      }
    } else if (field.type === 'tabs' && !field.name) {
      if ('tabs' in field && Array.isArray(field.tabs)) {
        for (const tab of field.tabs) {
          if (Array.isArray(tab.fields)) {
            result.push(...flattenFieldsForColumns(tab.fields))
          }
        }
      }
    } else if (field.name) {
      // Named field - include it
      result.push(field)
    }
  }

  return result
}

/**
 * Derive column definitions from collection fields.
 * Supports: text, textarea, email, number, checkbox, select, date, relationship/upload (hasMany false).
 * Includes synthetic columns: id, createdAt, updatedAt, _status (when drafts).
 */
export function deriveColumns(fields: Field[], opts: { drafts: boolean; collectionSlug?: string }): ColumnDef[] {
  const columns: ColumnDef[] = []
  const fieldNames = new Set<string>()

  const flattened = flattenFieldsForColumns(fields)

  for (const field of flattened) {
    if (!field.name) continue

    fieldNames.add(field.name)

    const label = fieldLabel(field)
    const baseLabel = typeof label === 'string' ? label : field.name

    if (field.type === 'text' || field.type === 'textarea' || field.type === 'email') {
      columns.push({
        name: field.name,
        label: baseLabel,
        type: field.type,
        sortable: true,
        filterable: true,
      })
    } else if (field.type === 'number') {
      columns.push({
        name: field.name,
        label: baseLabel,
        type: 'number',
        sortable: true,
        filterable: true,
      })
    } else if (field.type === 'checkbox') {
      columns.push({
        name: field.name,
        label: baseLabel,
        type: 'checkbox',
        sortable: true,
        filterable: true,
      })
    } else if (field.type === 'select') {
      const options =
        (field as any).options?.map((o: any) =>
          typeof o === 'string' ? { label: o, value: o } : { label: o.label || o.value, value: o.value },
        ) || []
      columns.push({
        name: field.name,
        label: baseLabel,
        type: 'select',
        sortable: true,
        filterable: true,
        options,
      })
    } else if (field.type === 'date') {
      columns.push({
        name: field.name,
        label: baseLabel,
        type: 'date',
        sortable: true,
        filterable: true,
      })
    } else if ((field.type === 'relationship' || field.type === 'upload') && !(field as any).hasMany) {
      // Single relationship/upload - label by field name, not sortable, not filterable
      columns.push({
        name: field.name,
        label: baseLabel,
        type: field.type,
        sortable: false,
        filterable: false,
      })
    }
  }

  // Synthetic columns
  // Thumbnail column for media collection (non-sortable, non-filterable display column)
  if (opts.collectionSlug === 'media') {
    columns.push({
      name: 'thumbnail',
      label: 'Thumbnail',
      type: 'thumbnail',
      sortable: false,
      filterable: false,
    })
  }

  // Auth collections: email is injected by the engine, not in fields
  if (opts.collectionSlug === 'users' && !fieldNames.has('email')) {
    columns.unshift({
      name: 'email',
      label: 'Email',
      type: 'email',
      sortable: true,
      filterable: true,
    })
  }

  if (!fieldNames.has('id')) {
    columns.push({
      name: 'id',
      label: 'ID',
      type: 'text',
      sortable: true,
      filterable: true,
    })
  }

  if (!fieldNames.has('createdAt')) {
    columns.push({
      name: 'createdAt',
      label: 'Created',
      type: 'date',
      sortable: true,
      filterable: true,
    })
  }

  if (!fieldNames.has('updatedAt')) {
    columns.push({
      name: 'updatedAt',
      label: 'Updated',
      type: 'date',
      sortable: true,
      filterable: true,
    })
  }

  if (opts.drafts && !fieldNames.has('_status')) {
    columns.push({
      name: '_status',
      label: 'Status',
      type: 'select',
      sortable: true,
      filterable: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    })
  }

  // Add createdBy and updatedBy if they exist as fields
  if (!fieldNames.has('createdBy')) {
    columns.push({
      name: 'createdBy',
      label: 'Created by',
      type: 'relationship',
      sortable: false,
      filterable: false,
    })
  }

  if (!fieldNames.has('updatedBy')) {
    columns.push({
      name: 'updatedBy',
      label: 'Last edited by',
      type: 'relationship',
      sortable: false,
      filterable: false,
    })
  }

  return columns
}

/**
 * Extract label from a field using the same logic as shared.ts fieldLabel.
 */
function fieldLabel(field: Field): string | Record<string, string> | undefined {
  if (!field) return undefined
  if (field.label === false) return undefined
  if (typeof field.label === 'string' || (field.label && typeof field.label === 'object' && !Array.isArray(field.label))) {
    return field.label as string | Record<string, string>
  }
  if (field.name) {
    return humanizeName(field.name)
  }
  return undefined
}

/**
 * Humanize a field name (camelCase -> Title Case).
 */
function humanizeName(str: string): string {
  return str
    .replace(/([A-Z])/g, ' $1') // camelCase -> words
    .replace(/^./, (match) => match.toUpperCase()) // capitalize
    .trim()
}

/* -------------------------------------------------------------------------- */
/* Defaults & List Defaults                                                   */
/* -------------------------------------------------------------------------- */

export const LIST_DEFAULTS: Record<string, CollectionListDefaults> = {
  users: {
    columns: ['email', 'roles', 'createdAt', 'updatedAt'],
    searchFields: ['email'],
    sort: '-updatedAt',
    limit: 25,
  },
  memberships: {
    columns: ['user', 'tier', 'status', 'startedAt', 'renewsAt'],
    searchFields: ['user', 'tier'],
    sort: '-updatedAt',
    limit: 25,
  },
  'membership-tiers': {
    columns: ['name', 'rank', 'price', 'interval', 'active'],
    searchFields: ['name'],
    sort: 'rank',
    limit: 25,
  },
  media: {
    columns: ['thumbnail', 'alt', 'createdAt', 'updatedAt'],
    searchFields: ['alt'],
    sort: '-createdAt',
    limit: 25,
  },
  pages: {
    columns: ['title', 'parent', 'slug', '_status', 'updatedAt'],
    searchFields: ['title', 'slug'],
    sort: '-updatedAt',
    limit: 25,
  },
  posts: {
    columns: ['title', 'publishedDate', '_status', 'updatedAt'],
    searchFields: ['title'],
    sort: '-publishedDate',
    limit: 25,
  },
  events: {
    columns: ['title', 'startDate', 'eventType', '_status', 'updatedAt'],
    searchFields: ['title'],
    sort: '-startDate',
    limit: 25,
  },
  products: {
    columns: ['title', 'slug', 'category', 'priceInAUD', 'createdAt', 'updatedAt'],
    searchFields: ['title', 'slug'],
    sort: '-createdAt',
    limit: 25,
  },
}

/**
 * Get list defaults for a collection.
 */
export function getListDefaults(
  slug: string,
  useAsTitle?: string,
  adminDefaultColumns?: string[],
): CollectionListDefaults {
  if (LIST_DEFAULTS[slug]) {
    return LIST_DEFAULTS[slug]
  }

  // Fallback to admin config
  const title = useAsTitle || 'id'
  const defaultCols = adminDefaultColumns && adminDefaultColumns.length > 0 ? adminDefaultColumns : [title]

  return {
    columns: defaultCols,
    searchFields: [title],
    sort: '-updatedAt',
    limit: 25,
  }
}

/* -------------------------------------------------------------------------- */
/* Query Building                                                             */
/* -------------------------------------------------------------------------- */

export type FindArgs = {
  where?: Record<string, unknown>
  sort?: string
  page: number
  limit: number
}

/* -------------------------------------------------------------------------- */
/* Visible Columns                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve which columns to display.
 * Priority: URL cols > savedCols > defaults.columns
 * Never return empty - fall back to first available column.
 * Returns both ColumnDef[] and visible names for convenience.
 */
export function resolveVisibleColumns(
  available: ColumnDef[],
  urlCols?: string[] | null,
  savedCols?: string[] | null,
  defaultCols?: string[],
): { visibleColumns: ColumnDef[]; visibleNames: string[] } {
  let colNames: string[] | null = urlCols
  if (!colNames) colNames = savedCols
  if (!colNames) colNames = defaultCols

  const result: ColumnDef[] = []
  if (colNames && Array.isArray(colNames)) {
    for (const name of colNames) {
      const col = available.find((c) => c.name === name)
      if (col) result.push(col)
    }
  }

  if (result.length === 0 && available.length > 0) {
    result.push(available[0])
  }

  const visibleNames = result.map((c) => c.name)
  return { visibleColumns: result, visibleNames }
}

/**
 * Build find args with proper collection context.
 * Signature used by ListView.
 */
export function buildFindArgs(opts: {
  collection: string
  urlParams: ListState
  allColumns: ColumnDef[]
}): FindArgs {
  const defaults = getListDefaults(opts.collection)
  const where: Record<string, unknown> = {}
  const conditions: Array<Record<string, unknown>> = []

  // Search over searchFields
  if (opts.urlParams.q) {
    const searchableFields = defaults.searchFields
    const searchCols = opts.allColumns.filter((c) => searchableFields.includes(c.name))
    const orConds = searchCols.map((col) => ({
      [col.name]: { contains: opts.urlParams.q },
    }))
    if (orConds.length > 0) {
      conditions.push({ or: orConds })
    }
  }

  // Filters
  for (const filter of opts.urlParams.filters) {
    const col = opts.allColumns.find((c) => c.name === filter.field)
    if (!col || !col.filterable) continue
    if (filter.value === '' && filter.op !== 'exists') continue

    let value: unknown = filter.value
    if (col.type === 'checkbox') {
      value = filter.value === 'true'
    } else if (col.type === 'number') {
      const num = parseFloat(filter.value)
      value = isNaN(num) ? filter.value : num
    } else if (filter.op === 'exists') {
      value = filter.value === 'true'
    }

    conditions.push({
      [filter.field]: { [filter.op]: value },
    })
  }

  // Combine with and
  if (conditions.length > 1) {
    where.and = conditions
  } else if (conditions.length === 1) {
    Object.assign(where, conditions[0])
  }

  // Sort - validate it's sortable
  let sort = opts.urlParams.sort || defaults.sort
  if (sort) {
    const fieldName = sort.startsWith('-') ? sort.slice(1) : sort
    const col = opts.allColumns.find((c) => c.name === fieldName)
    if (!col || !col.sortable) {
      sort = defaults.sort
    }
  }

  return {
    where: Object.keys(where).length > 0 ? where : undefined,
    sort: sort || undefined,
    page: opts.urlParams.page,
    limit: opts.urlParams.limit,
  }
}
