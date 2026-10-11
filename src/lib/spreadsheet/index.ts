import { parseCsv } from './csv'
import { readXlsx, XlsxError } from './xlsx'

export * from './csv'
export { readXlsx, excelSerialToIso, XLSX_MAX_ENTRIES, XLSX_MAX_UNCOMPRESSED, XlsxError } from './xlsx'

export const SPREADSHEET_MAX_BYTES = 2 * 1024 * 1024
export const SPREADSHEET_MAX_DATA_ROWS = 5000

export type SheetData = { rows: string[][]; truncated: boolean; kind: 'csv' | 'xlsx' }
export type SheetResult = ({ ok: true } & SheetData) | { ok: false; error: string }

/** Parses already-loaded bytes. `name` decides the format. */
export function parseSpreadsheetBytes(name: string, bytes: Uint8Array): SheetResult {
  const lower = name.toLowerCase()
  if (bytes.length > SPREADSHEET_MAX_BYTES) return { ok: false, error: 'This file is larger than 2 MB. Split it into smaller files.' }
  if (lower.endsWith('.xls')) return { ok: false, error: 'Old .xls files are not supported. Open it in Excel and save as .xlsx or .csv, then choose that file.' }
  const maxRows = SPREADSHEET_MAX_DATA_ROWS + 1
  try {
    if (lower.endsWith('.xlsx')) {
      const { rows, truncated } = readXlsx(bytes, { maxRows })
      return { ok: true, rows, truncated, kind: 'xlsx' }
    }
    if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
      const text = new TextDecoder('utf-8').decode(bytes)
      const { rows, truncated } = parseCsv(text, { maxRows, delimiter: lower.endsWith('.tsv') ? '\t' : undefined })
      return { ok: true, rows, truncated, kind: 'csv' }
    }
  } catch (error) {
    return { ok: false, error: error instanceof XlsxError ? error.message : 'Could not read this file.' }
  }
  return { ok: false, error: 'Choose a .csv, .tsv or .xlsx file.' }
}

export async function readSpreadsheetFile(file: File): Promise<SheetResult> {
  if (file.size > SPREADSHEET_MAX_BYTES) return { ok: false, error: 'This file is larger than 2 MB. Split it into smaller files.' }
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.xls')) return parseSpreadsheetBytes(file.name, new Uint8Array(0))
  try {
    return parseSpreadsheetBytes(file.name, new Uint8Array(await file.arrayBuffer()))
  } catch {
    return { ok: false, error: 'Could not read this file.' }
  }
}
