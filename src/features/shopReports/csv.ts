/**
 * CSV for the report exports. Pure. Text cells that a spreadsheet would read as a formula
 * (starting with = + - @ or a tab) get a leading apostrophe, so an exported product name cannot run code.
 */

export type CsvCell = string | number | null | undefined

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Header row, then one line per row. Lines end with CRLF, the usual spreadsheet format. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(cell).join(',')]
  for (const row of rows) lines.push(row.map(cell).join(','))
  return lines.join('\r\n') + '\r\n'
}

/** Cents as a plain decimal amount (1234 -> "12.34"), for spreadsheets. */
export function centsToDecimal(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
