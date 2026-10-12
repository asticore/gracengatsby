import { parseCsv } from '@/lib/spreadsheet/csv'

import { LIMITS, type DataViewDef } from './types'

/**
 * Rows of text from a typed-in grid or an imported CSV, with the heading row split off. Pure and
 * client safe (the editor uses it to list the columns a typed-in grid or an import offers).
 */
export function gridRows(view: Pick<DataViewDef, 'source' | 'csvText' | 'grid'>): { headers: string[]; rows: string[][] } {
  const raw = view.source === 'csv' ? parseCsv(view.csvText, { maxRows: LIMITS.maxGridRows + 1 }).rows : view.grid.rows
  const width = Math.min(LIMITS.maxGridCols, raw.reduce((max, row) => Math.max(max, row.length), 0))
  const padded = raw.slice(0, LIMITS.maxGridRows + 1).map((row) => Array.from({ length: width }, (_, i) => String(row[i] ?? '').slice(0, LIMITS.maxCell)))
  const hasHeader = view.source === 'csv' ? true : view.grid.headerRow
  const headers = hasHeader && padded[0] ? padded[0] : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  const rows = (hasHeader ? padded.slice(1) : padded).filter((row) => row.some((cell) => cell.trim() !== ''))
  return { headers, rows }
}
