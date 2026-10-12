import type { Cell, ResolvedColumn } from './types'

/**
 * Turns a cell into the text a visitor sees. Pure; safe for any input (an unreadable number or date
 * is shown as the original text rather than as NaN). Numbers use the en-AU locale, which is what the
 * rest of the site uses; the date format is fixed to UTC so a date never moves a day with the server.
 */

const LOCALE = 'en-AU'

export const parseNumber = (cell: Cell): number | null => {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null
  if (typeof cell !== 'string') return null
  const cleaned = cell.replace(/[\s,$%]/g, '')
  if (cleaned === '' || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function formatNumber(value: number, decimals: number, style: 'decimal' | 'currency' | 'percent', currency: string): string {
  const options: Intl.NumberFormatOptions = {}
  if (decimals >= 0) {
    options.minimumFractionDigits = decimals
    options.maximumFractionDigits = decimals
  } else if (style === 'currency') {
    options.minimumFractionDigits = Number.isInteger(value) ? 0 : 2
    options.maximumFractionDigits = 2
  } else {
    options.maximumFractionDigits = 2
  }
  try {
    if (style === 'currency') return new Intl.NumberFormat(LOCALE, { ...options, style: 'currency', currency }).format(value)
    if (style === 'percent') return `${new Intl.NumberFormat(LOCALE, options).format(value)}%`
    return new Intl.NumberFormat(LOCALE, options).format(value)
  } catch {
    return String(value)
  }
}

export function formatDate(cell: Cell): string {
  if (typeof cell !== 'string' || cell === '') return cell === null ? '' : String(cell)
  const time = Date.parse(cell)
  if (Number.isNaN(time)) return cell
  // Date only values (no time part) and full timestamps both show as a calendar date.
  return new Date(time).toLocaleDateString(LOCALE, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatCell(cell: Cell, column: Pick<ResolvedColumn, 'type' | 'format' | 'decimals' | 'currency'>): string {
  if (cell === null || cell === undefined || cell === '') return ''
  const format = column.format === 'auto' ? (column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text') : column.format
  switch (format) {
    case 'number':
    case 'currency':
    case 'percent': {
      const value = parseNumber(cell)
      if (value === null) return String(cell)
      return formatNumber(value, column.decimals, format === 'number' ? 'decimal' : format, column.currency || 'AUD')
    }
    case 'date':
      return formatDate(cell)
    default:
      return String(cell)
  }
}

/** Plain text for CSV and JSON export: the value as stored, with numbers unformatted. */
export const rawCell = (cell: Cell): string => (cell === null || cell === undefined ? '' : String(cell))
