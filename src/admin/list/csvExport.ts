/**
 * CSV export for the generic admin lists. The export uses the same list state as the screen
 * (the URL, or the user's saved columns and filters): the visible columns, and every row the
 * filters match, not just the current page. Pure helpers here; the route is
 * `src/app/(engage)/api/admin-list-csv/route.ts`.
 */

import type { Field } from '@/engine'
import { formatCellValue } from './cellFormatting'
import type { ColumnDef } from './listQuery'
import type { CellFormatter } from '@/admin/cellRegistry'

/** Rows per engine read while exporting. */
export const CSV_PAGE_SIZE = 500
/** Most rows one export returns. Past this the route sets `X-Export-Truncated: 1`. */
export const CSV_MAX_ROWS = 5000

/** Finds a column's field definition. Descends only into `row` and `collapsible` (layout only), as the list does. */
export function findColumnField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      const found = findColumnField(field.fields, name)
      if (found) return found
      continue
    }
    if ('name' in field && field.name === name) return field
  }
  return undefined
}

/**
 * One CSV field. Quotes when needed, and prefixes a single quote to a value that starts with
 * = + - @ or a tab or carriage return, so a spreadsheet does not run it as a formula.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
  return safe
}

/** Builds the CSV text: a header row of the visible column labels, then one line per document. */
export function buildListCsv(opts: {
  columns: ColumnDef[]
  fields: Field[]
  docs: Record<string, unknown>[]
  formatterFor: (column: ColumnDef, field: Field | undefined) => CellFormatter | undefined
}): string {
  const lines = [opts.columns.map((c) => csvField(c.label)).join(',')]
  for (const doc of opts.docs) {
    const cells = opts.columns.map((column) => {
      if (column.type === 'thumbnail') {
        return csvField(typeof doc.url === 'string' ? doc.url : '')
      }
      const field = findColumnField(opts.fields, column.name)
      const cell = doc[column.name]
      return csvField(formatCellValue(cell, doc, field, opts.formatterFor(column, field)))
    })
    lines.push(cells.join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/**
 * The query string the Export CSV link carries: the screen's own query without paging, so the
 * export covers every filtered row, with the same search, sort, columns, filters and trash view.
 */
export function csvQueryFromSearchParams(sp: Record<string, string | string[] | undefined>, collectionSlug: string): string {
  const params = new URLSearchParams({ collection: collectionSlug })
  for (const [key, value] of Object.entries(sp)) {
    if (key === 'page' || key === 'limit' || key === 'tab' || key === 'collection') continue
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
    for (const v of values) params.append(key, v)
  }
  return params.toString()
}
