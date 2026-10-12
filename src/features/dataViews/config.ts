import {
  CELL_FORMATS,
  FILTER_OPERATORS,
  LIMITS,
  VIEW_KINDS,
  VIEW_SOURCES,
  type CellFormat,
  type ChartOptions,
  type ColumnSpec,
  type DataSourceConfig,
  type DataViewDef,
  type DisplayOptions,
  type FilterOperator,
  type FilterRule,
  type GridConfig,
  type SortSpec,
  type ViewKind,
  type ViewSource,
} from './types'

/**
 * Turns whatever is stored (a JSON column that may be a string, a half-filled object or nonsense)
 * into a complete, bounded DataViewDef. Pure and safe on untrusted input: anything unknown is
 * dropped or replaced by a default, nothing throws.
 */

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown, max: number = LIMITS.maxText): string => (typeof value === 'string' ? value.slice(0, max) : '')

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

const int = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

/** Slugs: lowercase letters, digits and dashes, 1-60 characters, not purely digits (those are ids). */
export function normalizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  if (!slug || /^\d+$/.test(slug)) return null
  return slug
}

/** Keys that name a field: built-in keys, `cf:<name>` and grid keys. No spaces, no markup. */
export const FIELD_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/

const fieldKey = (value: unknown): string => (typeof value === 'string' && FIELD_KEY_PATTERN.test(value) ? value : '')

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function defaultDisplay(): DisplayOptions {
  return {
    caption: '',
    showHeader: true,
    footerRow: false,
    zebra: true,
    stickyHeader: false,
    sortable: true,
    searchable: false,
    pageSize: 0,
    responsive: 'scroll',
    totalsRow: false,
    totalsLabel: 'Total',
  }
}

export function defaultChart(): ChartOptions {
  return { x: '', y: [], seriesBy: '', aggregate: 'none', legend: true, dataLabels: false, xTitle: '', yTitle: '', stacked: false, smooth: false, height: 320 }
}

export function defaultData(): DataSourceConfig {
  return { collection: 'pages', category: '', filters: [], sort: null, limit: 50 }
}

export function normalizeColumns(raw: unknown): ColumnSpec[] {
  const list = parseJsonish(raw)
  if (!Array.isArray(list)) return []
  const out: ColumnSpec[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (!isObject(entry)) continue
    const key = fieldKey(entry.key)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      label: text(entry.label),
      format: oneOf<CellFormat>(entry.format, CELL_FORMATS, 'auto'),
      decimals: int(entry.decimals, -1, -1, 6),
      currency: /^[A-Za-z]{3}$/.test(String(entry.currency ?? '')) ? String(entry.currency).toUpperCase() : 'AUD',
    })
    if (out.length >= LIMITS.maxColumns) break
  }
  return out
}

export function normalizeFilters(raw: unknown): FilterRule[] {
  if (!Array.isArray(raw)) return []
  const out: FilterRule[] = []
  for (const entry of raw) {
    if (!isObject(entry)) continue
    const field = fieldKey(entry.field)
    const operator = typeof entry.operator === 'string' && (FILTER_OPERATORS as readonly string[]).includes(entry.operator) ? (entry.operator as FilterOperator) : null
    if (!field || !operator) continue
    out.push({ field, operator, value: text(entry.value) })
    if (out.length >= LIMITS.maxFilters) break
  }
  return out
}

function normalizeSort(raw: unknown): SortSpec | null {
  if (!isObject(raw)) return null
  const key = fieldKey(raw.key)
  if (!key) return null
  return { key, direction: raw.direction === 'desc' ? 'desc' : 'asc' }
}

export function normalizeData(raw: unknown): DataSourceConfig {
  const base = defaultData()
  if (!isObject(raw)) return base
  const collection = typeof raw.collection === 'string' && /^[a-z][a-z-]{0,40}$/.test(raw.collection) ? raw.collection : base.collection
  return {
    collection,
    category: text(raw.category),
    filters: normalizeFilters(raw.filters),
    sort: normalizeSort(raw.sort),
    limit: int(raw.limit, base.limit, 1, LIMITS.maxRows),
  }
}

export function normalizeGrid(raw: unknown): GridConfig {
  const empty: GridConfig = { headerRow: true, rows: [['Item', 'Value'], ['', '']] }
  if (!isObject(raw)) return empty
  const rows: string[][] = []
  if (Array.isArray(raw.rows)) {
    for (const row of raw.rows.slice(0, LIMITS.maxGridRows)) {
      if (!Array.isArray(row)) continue
      rows.push(row.slice(0, LIMITS.maxGridCols).map((cell) => (cell === null || cell === undefined ? '' : String(cell).slice(0, LIMITS.maxCell))))
    }
  }
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  for (const row of rows) while (row.length < width) row.push('')
  return { headerRow: bool(raw.headerRow, true), rows: rows.length ? rows : empty.rows }
}

export function normalizeDisplay(raw: unknown): DisplayOptions {
  const base = defaultDisplay()
  if (!isObject(raw)) return base
  return {
    caption: text(raw.caption),
    showHeader: bool(raw.showHeader, base.showHeader),
    footerRow: bool(raw.footerRow, base.footerRow),
    zebra: bool(raw.zebra, base.zebra),
    stickyHeader: bool(raw.stickyHeader, base.stickyHeader),
    sortable: bool(raw.sortable, base.sortable),
    searchable: bool(raw.searchable, base.searchable),
    pageSize: int(raw.pageSize, 0, 0, 200),
    responsive: raw.responsive === 'stacked' ? 'stacked' : 'scroll',
    totalsRow: bool(raw.totalsRow, base.totalsRow),
    totalsLabel: text(raw.totalsLabel, 40) || base.totalsLabel,
  }
}

export function normalizeChart(raw: unknown): ChartOptions {
  const base = defaultChart()
  if (!isObject(raw)) return base
  const y = Array.isArray(raw.y) ? raw.y.map(fieldKey).filter(Boolean) : []
  return {
    x: fieldKey(raw.x),
    y: [...new Set(y)].slice(0, LIMITS.maxSeries),
    seriesBy: fieldKey(raw.seriesBy),
    aggregate: oneOf(raw.aggregate, ['none', 'sum', 'count', 'average'] as const, 'none'),
    legend: bool(raw.legend, base.legend),
    dataLabels: bool(raw.dataLabels, base.dataLabels),
    xTitle: text(raw.xTitle, 80),
    yTitle: text(raw.yTitle, 80),
    stacked: bool(raw.stacked, base.stacked),
    smooth: bool(raw.smooth, base.smooth),
    height: int(raw.height, base.height, LIMITS.minHeight, LIMITS.maxHeight),
  }
}

/** The editor-side shape of the stored `config` JSON column. */
export type StoredConfig = {
  data: DataSourceConfig
  grid: GridConfig
  csvText: string
  columns: ColumnSpec[]
  display: DisplayOptions
  chart: ChartOptions
}

export function normalizeConfig(raw: unknown): StoredConfig {
  const config = parseJsonish(raw)
  const source = isObject(config) ? config : {}
  return {
    data: normalizeData(source.data),
    grid: normalizeGrid(source.grid),
    csvText: text(source.csvText, LIMITS.maxCsvChars),
    columns: normalizeColumns(source.columns),
    display: normalizeDisplay(source.display),
    chart: normalizeChart(source.chart),
  }
}

/** Builds a complete definition from a stored document row. */
export function normalizeDataView(doc: Record<string, unknown>): DataViewDef {
  const stored = normalizeConfig(doc.config)
  const id = Number(doc.id)
  return {
    id: Number.isFinite(id) ? id : 0,
    title: text(doc.title, 120) || 'Untitled',
    slug: normalizeSlug(doc.slug),
    kind: oneOf<ViewKind>(doc.kind, VIEW_KINDS, 'table'),
    source: oneOf<ViewSource>(doc.source, VIEW_SOURCES, 'custom-fields'),
    isPublic: doc.isPublic === true || doc.isPublic === 1,
    ...stored,
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
  }
}
