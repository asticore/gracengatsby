/**
 * CSV serialization and parsing for redirects
 * RFC 4180 compliant with validation
 */

import { validateRedirect, type RedirectType } from './validate'

export interface CsvRow {
  fromPath: string
  toPath: string
  redirectType: string
  enabled?: boolean
  note?: string
}

export interface ParsedCsv {
  valid: boolean
  rows: Array<CsvRow & { lineNumber: number }>
  errors: Array<{ line: number; message: string }>
}

/**
 * Escape a field for CSV according to RFC 4180.
 * Fields containing comma, quote, or newline must be quoted,
 * and internal quotes must be doubled.
 */
function escapeField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field
}

/**
 * Unquote and unescape a CSV field.
 * If the field is quoted, remove quotes and unescape internal doubled quotes.
 */
function unquoteField(field: string): string {
  if (field.startsWith('"') && field.endsWith('"')) {
    return field.slice(1, -1).replace(/''/g, '"')
  }
  return field
}

/**
 * Parse a CSV line into fields, respecting RFC 4180 quoting rules.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Doubled quote inside quoted field
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator outside quotes
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }

  // Add the last field
  fields.push(current)

  return fields
}

/**
 * Convert an array of redirect rows to CSV text.
 * Returns valid RFC 4180 CSV with header row.
 */
export function toCsv(rows: Array<{
  fromPath: string
  toPath: string
  redirectType: string
  enabled?: boolean
  note?: string
}>): string {
  const header = ['fromPath', 'toPath', 'redirectType', 'enabled', 'note']
  const lines = [header.join(',')]

  for (const row of rows) {
    const csvRow = [
      escapeField(row.fromPath),
      escapeField(row.toPath),
      escapeField(row.redirectType),
      escapeField(row.enabled !== false ? 'true' : 'false'),
      escapeField(row.note || ''),
    ]
    lines.push(csvRow.join(','))
  }

  return lines.join('\n')
}

/**
 * Parse CSV text into rows with validation.
 * Returns validation results: valid rows and errors with line numbers.
 * Max 1000 rows; each row validated with validate.ts.
 */
export function parseCsv(text: string, existing: Array<{ id?: number; fromPath: string; toPath: string; enabled: boolean }> = []): ParsedCsv {
  const errors: Array<{ line: number; message: string }> = []
  const rows: Array<CsvRow & { lineNumber: number }> = []

  const lines = text.trim().split('\n')

  // Validate header
  if (lines.length === 0) {
    return { valid: false, rows: [], errors: [{ line: 1, message: 'Empty CSV file' }] }
  }

  const headerLine = lines[0]
  const headerFields = parseCsvLine(headerLine)
  const expectedHeaders = ['fromPath', 'toPath', 'redirectType', 'enabled', 'note']

  if (headerFields.length < 3 || !headerFields.slice(0, 3).every((f, i) => f === expectedHeaders[i])) {
    return {
      valid: false,
      rows: [],
      errors: [{ line: 1, message: `Header must start with: ${expectedHeaders.slice(0, 3).join(', ')}` }],
    }
  }

  // Parse data rows (max 1000)
  for (let lineNum = 2; lineNum <= Math.min(lines.length, 1001); lineNum++) {
    const line = lines[lineNum - 1]
    if (!line.trim()) continue // Skip empty lines

    if (lineNum > 1001) {
      errors.push({ line: lineNum, message: 'CSV exceeds maximum of 1000 rows' })
      break
    }

    const fields = parseCsvLine(line)

    // Check minimum field count
    if (fields.length < 3) {
      errors.push({ line: lineNum, message: 'Row must have at least fromPath, toPath, and redirectType' })
      continue
    }

    const fromPath = unquoteField(fields[0]).trim()
    const toPath = unquoteField(fields[1]).trim()
    const redirectType = unquoteField(fields[2]).trim()
    const enabled = (fields[3] ? unquoteField(fields[3]).trim().toLowerCase() : 'true') !== 'false'
    const note = fields[4] ? unquoteField(fields[4]).trim() : ''

    // Validate required fields
    if (!fromPath || !toPath || !redirectType) {
      errors.push({
        line: lineNum,
        message: 'fromPath, toPath, and redirectType are required',
      })
      continue
    }

    // Validate the redirect using validate.ts logic
    const validationErrors = validateRedirect(
      { fromPath, toPath, redirectType: redirectType as RedirectType },
      existing,
    )

    if (validationErrors.length > 0) {
      for (const error of validationErrors) {
        errors.push({ line: lineNum, message: error })
      }
      continue
    }

    rows.push({
      fromPath,
      toPath,
      redirectType,
      enabled,
      note,
      lineNumber: lineNum,
    })
  }

  return {
    valid: errors.length === 0,
    rows,
    errors,
  }
}
