/**
 * Small, dependency free CSV / TSV parser for browser-side imports.
 * Handles a UTF-8 BOM, CRLF / LF / CR line ends, quoted fields, escaped quotes
 * ("") and newlines inside quotes. Everything stays text; nothing is evaluated.
 */

export type Delimiter = ',' | ';' | '\t'
const CANDIDATES: Delimiter[] = [',', ';', '\t']

export const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

/** Picks the delimiter that splits the first lines into the most consistent number of columns. Comma wins ties. */
export function sniffDelimiter(text: string): Delimiter {
  const sample = stripBom(text).slice(0, 8192)
  let best: Delimiter = ','
  let bestScore = 0
  for (const delimiter of CANDIDATES) {
    const counts: number[] = []
    let count = 0
    let inQuotes = false
    for (let i = 0; i < sample.length && counts.length < 6; i++) {
      const ch = sample[i]
      if (ch === '"') inQuotes = !inQuotes
      else if (!inQuotes && ch === delimiter) count++
      else if (!inQuotes && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && sample[i + 1] === '\n') i++
        counts.push(count)
        count = 0
      }
    }
    if (count > 0 || counts.length === 0) counts.push(count)
    const nonEmpty = counts.filter((c) => c > 0)
    if (nonEmpty.length === 0) continue
    // Consistent, high column counts score best.
    const first = counts[0]
    const consistent = counts.filter((c) => c === first).length
    const score = first > 0 ? first * 10 + consistent : nonEmpty.length
    if (score > bestScore) {
      best = delimiter
      bestScore = score
    }
  }
  return best
}

export type CsvResult = { rows: string[][]; delimiter: Delimiter; truncated: boolean }

/** `maxRows` counts every returned row, header included. Blank lines are dropped. */
export function parseCsv(input: string, options: { delimiter?: Delimiter; maxRows?: number } = {}): CsvResult {
  const text = stripBom(input)
  const delimiter = options.delimiter ?? sniffDelimiter(text)
  const maxRows = options.maxRows ?? Infinity
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let quoted = false
  let truncated = false

  const endField = () => {
    row.push(field)
    field = ''
    quoted = false
  }
  let i = 0
  let stopped = false
  for (; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"' && field === '') {
      inQuotes = true
      quoted = true
    } else if (ch === delimiter) endField()
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      const wasQuoted = quoted
      if (endRowQuoted(wasQuoted)) {
        stopped = true
        break
      }
    } else field += ch
  }

  function endRowQuoted(wasQuoted: boolean): boolean {
    endField()
    const blank = row.length === 1 && row[0] === '' && !wasQuoted
    if (!blank) rows.push(row)
    row = []
    if (rows.length >= maxRows) {
      // Only "truncated" when more input follows.
      truncated = true
      return true
    }
    return false
  }

  if (!stopped && (field !== '' || row.length > 0 || quoted)) {
    const wasQuoted = quoted
    endField()
    const blank = row.length === 1 && row[0] === '' && !wasQuoted
    if (!blank) rows.push(row)
  }
  if (truncated) {
    // Make sure there really was more content after the cut.
    const rest = text.slice(i + 1).trim()
    if (!rest) truncated = false
  }
  return { rows, delimiter, truncated }
}

/** Builds a CSV (comma separated, CRLF) from rows of text. */
export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/["\n\r,;\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
