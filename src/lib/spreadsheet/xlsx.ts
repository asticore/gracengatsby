import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

/**
 * Minimal .xlsx reader. An .xlsx is a zip of XML parts; we read the workbook
 * to find the first sheet, plus shared strings and styles (to know which
 * numbers are dates). Values come back as text. Nothing is evaluated: formulas
 * are ignored and only their cached values are read. Merged cells are ignored.
 *
 * Zip bomb guards: entry count and total uncompressed bytes are capped, and the
 * cap is enforced on the bytes actually produced, not on sizes the file claims.
 */

export const XLSX_MAX_ENTRIES = 200
export const XLSX_MAX_UNCOMPRESSED = 20 * 1024 * 1024
const MAX_COLUMNS = 200

export class XlsxError extends Error {}

const decoder = new TextDecoder('utf-8')

function extract(data: Uint8Array, wanted: (name: string) => boolean): Map<string, string> {
  const out = new Map<string, string>()
  let entries = 0
  let total = 0
  let failure: XlsxError | null = null
  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  unzip.onfile = (file) => {
    if (failure) return
    entries++
    if (entries > XLSX_MAX_ENTRIES) {
      failure = new XlsxError('This workbook has too many parts to read safely.')
      return
    }
    if (file.name.endsWith('/') || !wanted(file.name)) return
    if (typeof file.originalSize === 'number' && file.originalSize > XLSX_MAX_UNCOMPRESSED) {
      failure = new XlsxError('This workbook is too large once unpacked (limit 20 MB).')
      return
    }
    const chunks: Uint8Array[] = []
    file.ondata = (err, chunk, final) => {
      if (failure) return
      if (err) {
        failure = new XlsxError('This file is not a valid .xlsx workbook.')
        return
      }
      total += chunk.length
      if (total > XLSX_MAX_UNCOMPRESSED) {
        failure = new XlsxError('This workbook is too large once unpacked (limit 20 MB).')
        file.terminate()
        return
      }
      chunks.push(chunk)
      if (final) {
        const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
        let at = 0
        for (const c of chunks) {
          merged.set(c, at)
          at += c.length
        }
        out.set(file.name, decoder.decode(merged))
      }
    }
    try {
      file.start()
    } catch {
      failure = new XlsxError('This file is not a valid .xlsx workbook.')
    }
  }
  try {
    unzip.push(data, true)
  } catch {
    throw failure ?? new XlsxError('This file is not a valid .xlsx workbook.')
  }
  if (failure) throw failure
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return ''
      try {
        return String.fromCodePoint(code)
      } catch {
        return ''
      }
    }
    return ENTITIES[body] ?? whole
  })
}

const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)
  return m ? decodeXml(m[2] ?? m[3] ?? '') : undefined
}

/** Text of all <t> runs inside a fragment (shared string item or inline string), skipping phonetic <rPh>. */
function textRuns(fragment: string): string {
  const cleaned = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')
  let out = ''
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned))) out += decodeXml(m[1] ?? '')
  return out
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(textRuns(m[1] ?? ''))
  return out
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58])

function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .replace(/_./g, '')
    .replace(/\*./g, '')
  return /[ymdhs]/i.test(stripped) && !/^(general|@)$/i.test(stripped.trim())
}

/** Style index -> is a date/time number format. */
function parseDateStyles(xml: string | undefined): boolean[] {
  if (!xml) return []
  const custom = new Map<number, string>()
  const fmts = /<numFmt\b[^>]*?\/?>/g
  let m: RegExpExecArray | null
  while ((m = fmts.exec(xml))) {
    const id = Number(attr(m[0], 'numFmtId'))
    const code = attr(m[0], 'formatCode')
    if (Number.isFinite(id) && code !== undefined) custom.set(id, code)
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)
  if (!xfs) return []
  const out: boolean[] = []
  const re = /<xf\b[^>]*?\/?>/g
  while ((m = re.exec(xfs[1]))) {
    const id = Number(attr(m[0], 'numFmtId') ?? 0)
    out.push(custom.has(id) ? isDateFormatCode(custom.get(id) as string) : BUILTIN_DATE_FORMATS.has(id))
  }
  return out
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** Excel serial (1900 date system) to ISO text. Whole days give YYYY-MM-DD, times add THH:MM:SS, serial < 1 is a time only. */
export function excelSerialToIso(serial: number, date1904 = false): string {
  if (!Number.isFinite(serial) || serial < 0) return String(serial)
  let day = Math.floor(serial)
  let seconds = Math.round((serial - day) * 86400)
  // A time a hair under midnight rounds up to a whole day: roll over to the next date instead of printing 24:00:00.
  if (seconds >= 86400) {
    day += 1
    seconds = 0
  }
  const timePart = () => `${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`
  if (day === 0 && seconds > 0) return timePart()
  const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30)
  const d = new Date(epoch + day * 86400000)
  if (Number.isNaN(d.getTime())) return String(serial)
  const iso = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  return seconds > 0 ? `${iso}T${timePart()}` : iso
}

function columnIndex(ref: string): number {
  const letters = /^[A-Za-z]+/.exec(ref)?.[0]
  if (!letters) return -1
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function findFirstSheetPath(files: Map<string, string>): string | null {
  const workbook = files.get('xl/workbook.xml')
  const rels = files.get('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const sheetTag = /<sheet\b[^>]*?\/?>/.exec(workbook)?.[0]
    const rid = sheetTag ? attr(sheetTag, 'r:id') : undefined
    if (rid) {
      const relRe = /<Relationship\b[^>]*?\/?>/g
      let m: RegExpExecArray | null
      while ((m = relRe.exec(rels))) {
        if (attr(m[0], 'Id') === rid) {
          const target = attr(m[0], 'Target')
          if (!target) break
          const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
          return path.replace(/[^/]+\/\.\.\//g, '')
        }
      }
    }
  }
  return null
}

type XmlElement = { attrs: string; inner: string | undefined }

/**
 * Elements named `tag` in document order, found with indexOf only (one forward pass, linear in the
 * input). Self-closing elements have `inner` undefined. An element that never closes ends the scan
 * rather than being searched for again from every later position.
 */
function* elementsOf(xml: string, tag: string): Generator<XmlElement> {
  const open = `<${tag}`
  const close = `</${tag}>`
  let pos = 0
  for (;;) {
    const start = xml.indexOf(open, pos)
    if (start === -1) return
    const next = xml.charCodeAt(start + open.length)
    // Must be the whole tag name: `<c` is not `<cols>` or `<cellXfs>`.
    if (!(next === 32 || next === 9 || next === 10 || next === 13 || next === 62 || next === 47)) {
      pos = start + open.length
      continue
    }
    const gt = xml.indexOf('>', start)
    if (gt === -1) return
    const selfClosing = xml.charCodeAt(gt - 1) === 47
    const attrs = xml.slice(start + open.length, selfClosing ? gt - 1 : gt)
    if (selfClosing) {
      pos = gt + 1
      yield { attrs, inner: undefined }
      continue
    }
    const end = xml.indexOf(close, gt + 1)
    if (end === -1) return
    pos = end + close.length
    yield { attrs, inner: xml.slice(gt + 1, end) }
  }
}

export type XlsxResult = { rows: string[][]; truncated: boolean }

/** Reads the first worksheet. `maxRows` counts rows returned, header included. */
export function readXlsx(data: Uint8Array, options: { maxRows?: number } = {}): XlsxResult {
  const maxRows = options.maxRows ?? Infinity
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new XlsxError('This file is not a valid .xlsx workbook.')

  const meta = extract(data, (n) => ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml'].includes(n))
  const workbookXml = meta.get('xl/workbook.xml')
  if (!workbookXml) throw new XlsxError('This file is not a valid .xlsx workbook.')
  const sheetPath = findFirstSheetPath(meta) ?? 'xl/worksheets/sheet1.xml'
  const sheets = extract(data, (n) => n === sheetPath)
  const sheetXml = sheets.get(sheetPath)
  if (!sheetXml) throw new XlsxError('Could not find the first sheet in this workbook.')

  const shared = parseSharedStrings(meta.get('xl/sharedStrings.xml'))
  const dateStyles = parseDateStyles(meta.get('xl/styles.xml'))
  const date1904 = /<workbookPr\b[^>]*date1904\s*=\s*["'](1|true)["']/i.test(workbookXml)

  const rows: string[][] = []
  let truncated = false
  let nextRow = 0
  for (const rowEl of elementsOf(sheetXml, 'row')) {
    const rowNumber = Number(attr(rowEl.attrs, 'r'))
    const rowIndex = Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : nextRow
    nextRow = rowIndex + 1
    if (rowIndex >= Math.min(maxRows, 100000) + 10000) {
      truncated = true
      break
    }
    const cells: string[] = []
    let nextCol = 0
    const body = rowEl.inner ?? ''
    for (const cellEl of elementsOf(body, 'c')) {
      const ref = attr(cellEl.attrs, 'r')
      let col = ref ? columnIndex(ref) : -1
      if (col < 0) col = nextCol
      nextCol = col + 1
      if (col >= MAX_COLUMNS) continue
      const type = attr(cellEl.attrs, 't')
      const inner = cellEl.inner ?? ''
      const v = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value = ''
      if (type === 'inlineStr') value = textRuns(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '')
      else if (v === undefined) value = ''
      else if (type === 's') value = shared[Number(decodeXml(v))] ?? ''
      else if (type === 'b') value = decodeXml(v).trim() === '1' ? 'TRUE' : 'FALSE'
      else if (type === 'e') value = ''
      else if (type === 'str') value = decodeXml(v)
      else {
        value = decodeXml(v).trim()
        const style = Number(attr(cellEl.attrs, 's'))
        if (value !== '' && Number.isInteger(style) && dateStyles[style]) {
          const serial = Number(value)
          if (Number.isFinite(serial)) value = excelSerialToIso(serial, date1904)
        }
      }
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    while (cells.length && cells[cells.length - 1] === '') cells.pop()
    while (rows.length < rowIndex) rows.push([])
    rows[rowIndex] = cells
  }
  // Drop blank rows entirely (keeps positions relative to each other).
  const compact = rows.filter((r) => r && r.some((c) => c !== ''))
  if (compact.length > maxRows) {
    truncated = true
    compact.length = maxRows
  }
  return { rows: compact, truncated }
}
