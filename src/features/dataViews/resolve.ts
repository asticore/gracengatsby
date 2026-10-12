import type { CustomFieldDef, FieldGroupDoc } from '@/fields/customFields/types'
import { pruneHiddenValues } from '@/features/customFields/conditions'
import { locationContextFor } from '@/features/customFields/server'
import { stringifyFieldValue } from '@/features/customFields/stringify'
import { definitionsFor } from '@/features/customFields/validate'

import {
  CUSTOM_PREFIX,
  SOURCE_COLLECTION_MAP,
  buildCatalogue,
  categoryMatches,
  isSelectableCustomField,
  readBuiltIn,
  type FieldInfo,
} from './catalogue'
import { compareCells, matchesRule } from './filter'
import { parseNumber } from './format'
import { gridRows } from './grid'
import { LIMITS, type Cell, type ColumnSpec, type DataViewDef, type ResolvedColumn, type TableData } from './types'

/**
 * Builds the rows and columns of a view from its source. Pure apart from the three reads in
 * ResolveDeps, which the server supplies (see load.ts) and the tests replace.
 *
 * Visibility is decided here, not by the caller: only published documents are used, documents locked
 * to members or protected by a password are skipped, and only fields in the catalogue can be read.
 */

export type ResolveDeps = {
  /** Documents of a collection, most relevant first, at most `limit`. Read without access checks; this module filters. */
  findDocs: (collection: string, args: { versioned: boolean; sort: string; limit: number }) => Promise<Record<string, unknown>[]>
  loadGroups: () => Promise<FieldGroupDoc[]>
  /** Ids of documents in the collection that sit behind a password. */
  protectedIds: (collection: string) => Promise<Set<number>>
}

const EMPTY: TableData = { columns: [], rows: [], truncated: false }

const toCell = (value: unknown): Cell => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  return String(value).slice(0, LIMITS.maxCell)
}

function columnFor(info: Pick<FieldInfo, 'kind' | 'label' | 'defaultFormat'>, spec: ColumnSpec): ResolvedColumn {
  return {
    key: spec.key,
    label: spec.label || info.label,
    type: info.kind === 'number' ? 'number' : info.kind === 'date' ? 'date' : 'text',
    format: spec.format === 'auto' ? info.defaultFormat : spec.format,
    decimals: spec.decimals,
    currency: spec.currency,
  }
}

function customCell(def: CustomFieldDef, value: unknown): Cell {
  if (def.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : null
  if (def.type === 'date' || def.type === 'datetime') return typeof value === 'string' && value ? value : null
  const text = stringifyFieldValue(def, value)
  return text === '' ? null : text.slice(0, LIMITS.maxCell)
}

/** Documents a visitor could not see anyway are never used. */
export function isPublicDocument(collection: string, doc: Record<string, unknown>, protectedIds: Set<number>): boolean {
  const source = SOURCE_COLLECTION_MAP[collection]
  if (!source) return false
  if (source.versioned && doc._status !== 'published') return false
  if (doc.trashedAt) return false
  const members = doc.membersOnly
  if (members && typeof members === 'object' && (members as { enabled?: unknown }).enabled === true) return false
  const id = Number(doc.id)
  if (Number.isFinite(id) && protectedIds.has(id)) return false
  return true
}

async function resolveFromCollection(view: DataViewDef, deps: ResolveDeps): Promise<TableData> {
  const collection = view.data.collection
  const source = SOURCE_COLLECTION_MAP[collection]
  if (!source) return EMPTY

  const groups = await deps.loadGroups()
  const catalogue = buildCatalogue(collection, groups)
  const info = new Map(catalogue.map((field) => [field.key, field]))

  // Columns: only chosen fields that are in the catalogue. With none chosen, show the first field.
  let specs = view.columns.filter((spec) => info.has(spec.key))
  if (specs.length === 0 && catalogue[0]) specs = [{ key: catalogue[0].key, label: '', format: 'auto', decimals: -1, currency: 'AUD' }]
  const columns = specs.map((spec) => columnFor(info.get(spec.key)!, spec))

  const filters = view.data.filters.filter((rule) => info.has(rule.field))
  const sort = view.data.sort && info.has(view.data.sort.key) ? view.data.sort : null

  // Every key whose value is needed for this view.
  const needed = new Set<string>([...specs.map((s) => s.key), ...filters.map((f) => f.field), ...(sort ? [sort.key] : [])])

  const [docs, locked] = await Promise.all([
    deps.findDocs(collection, { versioned: source.versioned, sort: source.readSort, limit: LIMITS.maxFetchedDocs }),
    deps.protectedIds(collection),
  ])

  const truncatedInput = docs.length >= LIMITS.maxFetchedDocs

  const records: { values: Map<string, Cell> }[] = []
  for (const doc of docs) {
    if (!isPublicDocument(collection, doc, locked)) continue
    if (!categoryMatches(collection, doc, view.data.category)) continue

    const customValues = doc.customFields && typeof doc.customFields === 'object' && !Array.isArray(doc.customFields) ? (doc.customFields as Record<string, unknown>) : {}
    let defsByName: Map<string, CustomFieldDef> | null = null
    let visible: Record<string, unknown> | null = null
    const values = new Map<string, Cell>()
    for (const key of needed) {
      if (key.startsWith(CUSTOM_PREFIX)) {
        if (!defsByName) {
          // Only groups that apply to this very document, and only values not hidden by their conditions.
          const defs = definitionsFor(groups, locationContextFor(collection, doc)).filter(isSelectableCustomField)
          defsByName = new Map(defs.map((def) => [def.name, def]))
          visible = pruneHiddenValues(defs, customValues)
        }
        const def = defsByName.get(key.slice(CUSTOM_PREFIX.length))
        values.set(key, def && visible ? customCell(def, visible[def.name]) : null)
      } else {
        values.set(key, toCell(readBuiltIn(collection, key, doc)))
      }
    }
    records.push({ values })
  }

  let kept = records.filter((record) => filters.every((rule) => matchesRule(record.values.get(rule.field) ?? null, rule, info.get(rule.field)!.kind)))
  if (sort) {
    const kind = info.get(sort.key)!.kind
    const direction = sort.direction === 'desc' ? -1 : 1
    kept = [...kept].sort((a, b) => {
      const x = a.values.get(sort.key) ?? null
      const y = b.values.get(sort.key) ?? null
      // Empty values stay last in either direction.
      if (x === null || x === '' || y === null || y === '') return compareCells(x, y, kind)
      return compareCells(x, y, kind) * direction
    })
  }

  const limit = Math.min(view.data.limit, LIMITS.maxRows)
  const truncated = truncatedInput || kept.length > limit
  return { columns, rows: kept.slice(0, limit).map((record) => specs.map((spec) => record.values.get(spec.key) ?? null)), truncated }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/

function resolveFromGrid(view: DataViewDef): TableData {
  const { headers, rows } = gridRows(view)
  if (headers.length === 0) return EMPTY

  const inferred: ResolvedColumn[] = headers.map((header, i) => {
    const cells = rows.map((row) => row[i] ?? '').filter((cell) => cell.trim() !== '')
    const numeric = cells.length > 0 && cells.every((cell) => parseNumber(cell) !== null)
    const dates = cells.length > 0 && cells.every((cell) => ISO_DATE.test(cell.trim()))
    return { key: `c${i}`, label: header.trim() || `Column ${i + 1}`, type: numeric ? 'number' : dates ? 'date' : 'text', format: 'auto', decimals: -1, currency: 'AUD' }
  })

  let order = inferred.map((_, i) => i)
  const columns = inferred.map((column) => ({ ...column }))
  if (view.columns.length > 0) {
    const chosen = view.columns.map((spec) => ({ spec, index: Number(spec.key.slice(1)) })).filter(({ spec, index }) => /^c\d+$/.test(spec.key) && index < inferred.length)
    if (chosen.length > 0) {
      order = chosen.map(({ index }) => index)
      for (const { spec, index } of chosen) {
        const column = columns[index]!
        if (spec.label) column.label = spec.label
        column.format = spec.format
        column.decimals = spec.decimals
        column.currency = spec.currency
      }
    }
  }

  let body: Cell[][] = rows.map((row) => row.map((cell, i) => (inferred[i]?.type === 'number' ? (parseNumber(cell) ?? null) : cell === '' ? null : cell)))
  const sort = view.data.sort
  const sortIndex = sort && /^c\d+$/.test(sort.key) ? Number(sort.key.slice(1)) : -1
  if (sort && sortIndex >= 0 && sortIndex < inferred.length) {
    const kind = inferred[sortIndex]!.type === 'number' ? 'number' : inferred[sortIndex]!.type === 'date' ? 'date' : 'text'
    const direction = sort.direction === 'desc' ? -1 : 1
    body = [...body].sort((a, b) => {
      const x = a[sortIndex] ?? null
      const y = b[sortIndex] ?? null
      if (x === null || y === null) return compareCells(x, y, kind)
      return compareCells(x, y, kind) * direction
    })
  }
  const limit = LIMITS.maxRows
  return { columns: order.map((i) => columns[i]!), rows: body.slice(0, limit).map((row) => order.map((i) => row[i] ?? null)), truncated: body.length > limit }
}

/** Resolves any view to table data. Never throws for bad stored data; a failing read is the caller's to catch. */
export async function resolveTableData(view: DataViewDef, deps: ResolveDeps): Promise<TableData> {
  if (view.source === 'custom-fields') return resolveFromCollection(view, deps)
  return resolveFromGrid(view)
}
