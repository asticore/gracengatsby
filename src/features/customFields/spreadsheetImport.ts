import { validateValue, type FieldProblem } from './validate'
import { toCsv } from '@/lib/spreadsheet/csv'
import type { CustomFieldDef, CustomFieldType } from '@/fields/customFields/types'

/**
 * Pure helpers behind "Import from CSV or Excel" (repeater rows) and "Create
 * fields from a header row" (set builder). No DOM, so they are unit tested.
 * Imported values only ever go into form state; the normal server validation
 * still runs on save.
 */

/** Sub field types a spreadsheet cell can fill. */
export const IMPORTABLE_TYPES: ReadonlySet<CustomFieldType> = new Set<CustomFieldType>([
  'text', 'textarea', 'wysiwyg', 'number', 'checkbox', 'select', 'radio', 'button-group',
  'url', 'email', 'phone', 'date', 'datetime', 'time', 'color',
])

export const importableFields = (def: CustomFieldDef): CustomFieldDef[] => (def.subFields ?? []).filter((f) => f.name && IMPORTABLE_TYPES.has(f.type))
export const unsupportedFields = (def: CustomFieldDef): CustomFieldDef[] => (def.subFields ?? []).filter((f) => f.name && !IMPORTABLE_TYPES.has(f.type))

const loose = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** name -> column index, or -1 (skip). Matches header text to the sub field name or label, ignoring case, spaces and punctuation. Each column is used once. */
export function autoMapColumns(headers: string[], fields: CustomFieldDef[]): Record<string, number> {
  const used = new Set<number>()
  const result: Record<string, number> = {}
  const pass = (matcher: (h: string, f: CustomFieldDef) => boolean) => {
    for (const f of fields) {
      if (result[f.name] !== undefined && result[f.name] >= 0) continue
      const at = headers.findIndex((h, i) => !used.has(i) && h.trim() !== '' && matcher(h, f))
      if (at >= 0) {
        result[f.name] = at
        used.add(at)
      } else if (result[f.name] === undefined) result[f.name] = -1
    }
  }
  pass((h, f) => h.trim().toLowerCase() === f.name.toLowerCase() || h.trim().toLowerCase() === (f.label || '').trim().toLowerCase())
  pass((h, f) => loose(h) !== '' && (loose(h) === loose(f.name) || loose(h) === loose(f.label || '')))
  return result
}

type Converted = { ok: true; value: unknown } | { ok: false; reason: string }
const empty: Converted = { ok: true, value: undefined }

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on', 'x', 'ticked'])
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off'])
const pad = (n: number | string, w = 2) => String(n).padStart(w, '0')

const validDate = (y: number, m: number, d: number): boolean => {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** "2024-03-05", "2024/3/5" or an ISO date-time -> "2024-03-05" plus the time part if any. */
function parseDateText(raw: string): { date: string; time?: string } | null {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!validDate(y, mo, d)) return null
  const date = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`
  if (m[4] === undefined) return { date }
  const [h, mi] = [Number(m[4]), Number(m[5])]
  if (h > 23 || mi > 59) return null
  return { date, time: `${pad(h)}:${pad(mi)}` }
}

/** Converts one spreadsheet cell to the stored value for `def`. Blank cells give an undefined value. */
export function convertCell(def: CustomFieldDef, raw: string): Converted {
  const text = (raw ?? '').trim()
  if (text === '') return empty
  switch (def.type) {
    case 'number': {
      const clean = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text) ? text.replace(/,/g, '') : text
      const n = Number(clean)
      if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(clean) || !Number.isFinite(n)) return { ok: false, reason: `"${text}" is not a number` }
      return { ok: true, value: n }
    }
    case 'checkbox': {
      const w = text.toLowerCase()
      if (TRUE_WORDS.has(w)) return { ok: true, value: true }
      if (FALSE_WORDS.has(w)) return { ok: true, value: false }
      return { ok: false, reason: `"${text}" is not true/false, yes/no or 1/0` }
    }
    case 'select':
    case 'radio':
    case 'button-group': {
      const options = def.options ?? []
      const find = (s: string): string | undefined => {
        const k = s.trim().toLowerCase()
        return (options.find((o) => o.value.toLowerCase() === k) ?? options.find((o) => o.label.trim().toLowerCase() === k))?.value
      }
      if (def.type === 'select' && def.multiple) {
        const whole = find(text)
        const parts = whole !== undefined ? [whole] : text.split(/[;|,]/).map((p) => p.trim()).filter(Boolean)
        const out: string[] = []
        for (const part of parts) {
          const hit = options.length === 0 ? part : find(part)
          if (hit === undefined) return { ok: false, reason: `"${part}" is not one of the choices` }
          if (!out.includes(hit)) out.push(hit)
        }
        return { ok: true, value: out }
      }
      if (options.length === 0) return { ok: true, value: text }
      const hit = find(text)
      return hit === undefined ? { ok: false, reason: `"${text}" is not one of the choices` } : { ok: true, value: hit }
    }
    case 'date': {
      const p = parseDateText(text)
      return p ? { ok: true, value: p.date } : { ok: false, reason: `"${text}" is not a date like 2024-03-31` }
    }
    case 'datetime': {
      const p = parseDateText(text)
      return p ? { ok: true, value: `${p.date}T${p.time ?? '00:00'}` } : { ok: false, reason: `"${text}" is not a date and time like 2024-03-31 14:30` }
    }
    case 'time': {
      const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text)
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return { ok: false, reason: `"${text}" is not a time like 14:30` }
      return { ok: true, value: `${pad(m[1])}:${m[2]}` }
    }
    case 'color': {
      const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text)
      if (!m) return { ok: false, reason: `"${text}" is not a hex colour like #1a2b3c` }
      const hex = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
      return { ok: true, value: `#${hex.toLowerCase()}` }
    }
    default:
      return { ok: true, value: text }
  }
}

export type SkippedRow = { line: number; reason: string }
export type ImportResult = { rows: Record<string, unknown>[]; skipped: SkippedRow[] }

/**
 * Turns data rows (header excluded) into repeater rows. `line` numbers in
 * `skipped` are spreadsheet line numbers (header = 1). `capacity` is how many
 * rows may still be added; rows beyond it are skipped.
 */
export function buildImportRows(
  fields: CustomFieldDef[],
  mapping: Record<string, number>,
  dataRows: string[][],
  options: { capacity?: number } = {},
): ImportResult {
  const capacity = options.capacity ?? Infinity
  const rows: Record<string, unknown>[] = []
  const skipped: SkippedRow[] = []
  dataRows.forEach((cells, index) => {
    const line = index + 2
    const out: Record<string, unknown> = {}
    const problems: string[] = []
    let anyValue = false
    for (const f of fields) {
      const col = mapping[f.name]
      const raw = col !== undefined && col >= 0 ? (cells[col] ?? '') : ''
      if (raw.trim() !== '') anyValue = true
      const c = col !== undefined && col >= 0 ? convertCell(f, raw) : empty
      if ('reason' in c) {
        problems.push(`${f.label || f.name}: ${c.reason}`)
        continue
      }
      if (c.value !== undefined) out[f.name] = c.value
    }
    if (!anyValue) {
      skipped.push({ line, reason: 'Empty row' })
      return
    }
    if (problems.length === 0) {
      const found: FieldProblem[] = []
      for (const f of fields) if (out[f.name] !== undefined || f.required) validateValue(f, out[f.name], f.label || f.name, f.name, found)
      for (const p of found) problems.push(`${p.path} ${p.message}`)
    }
    if (problems.length) {
      skipped.push({ line, reason: problems.join('; ') })
      return
    }
    if (rows.length >= capacity) {
      skipped.push({ line, reason: 'Over the maximum number of rows' })
      return
    }
    rows.push(out)
  })
  return { rows, skipped }
}

/** CSV text with the sub field names as headers, plus one empty example row. */
export function templateCsv(def: CustomFieldDef): string {
  const fields = importableFields(def)
  return toCsv([fields.map((f) => f.name)])
}

/* ---------- header row to fields ---------- */

export type SniffedType = 'text' | 'textarea' | 'number' | 'date' | 'checkbox'

export function sniffType(values: string[]): SniffedType {
  const samples = values.map((v) => (v ?? '').trim()).filter((v) => v !== '').slice(0, 20)
  if (samples.length === 0) return 'text'
  if (samples.every((v) => ['true', 'false', 'yes', 'no', 'y', 'n'].includes(v.toLowerCase()))) return 'checkbox'
  // Digit strings with a leading zero (00123, zip codes, SKUs) are identifiers, not numbers: keep them as text.
  const hasLeadingZero = (v: string) => /^[-+]?0\d/.test(v)
  const allNumeric = samples.every((v) => /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v.replace(/^(-?\d{1,3})(,\d{3})+(\.\d+)?$/, (m) => m.replace(/,/g, ''))))
  if (allNumeric) return samples.some(hasLeadingZero) ? 'text' : 'number'
  if (samples.every((v) => parseDateText(v) !== null)) return 'date'
  if (samples.some((v) => v.length > 120 || /[\r\n]/.test(v))) return 'textarea'
  return 'text'
}

/** Lowercase letters, digits and underscores; never empty; never starts with a digit. */
export function slugifyName(raw: string): string {
  const s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!s) return 'field'
  return /^[0-9]/.test(s) ? `f_${s}` : s
}

export function uniqueName(raw: string, taken: Set<string>): string {
  const base = slugifyName(raw)
  let name = base
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
  taken.add(name)
  return name
}

export type SniffedField = { label: string; name: string; type: SniffedType }

/** Fields from a header row. `existing` names are avoided. Blank headers are skipped. */
export function fieldsFromHeader(rows: string[][], existing: string[] = []): SniffedField[] {
  const [header = [], ...data] = rows
  const taken = new Set(existing)
  const out: SniffedField[] = []
  header.forEach((h, col) => {
    const label = (h ?? '').trim()
    if (!label) return
    out.push({ label, name: uniqueName(label, taken), type: sniffType(data.slice(0, 20).map((r) => r[col] ?? '')) })
  })
  return out
}

export const sniffedToDef = (f: SniffedField): CustomFieldDef => ({ label: f.label, name: f.name, type: f.type, required: false })
