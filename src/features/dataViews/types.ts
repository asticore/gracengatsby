/**
 * Shapes shared by the editor, the resolver, the renderers and the endpoints.
 * Everything stored is plain JSON; `normalizeDataView` (./config.ts) turns any stored value into these
 * shapes and drops what it does not understand, so nothing downstream sees untrusted structure.
 */

export const VIEW_KINDS = ['table', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'] as const
export type ViewKind = (typeof VIEW_KINDS)[number]

export const VIEW_SOURCES = ['custom-fields', 'manual', 'csv'] as const
export type ViewSource = (typeof VIEW_SOURCES)[number]

export const KIND_LABELS: Record<ViewKind, string> = {
  table: 'Table',
  bar: 'Bar chart',
  line: 'Line chart',
  area: 'Area chart',
  pie: 'Pie chart',
  doughnut: 'Doughnut chart',
  scatter: 'Scatter plot',
}

export const SOURCE_LABELS: Record<ViewSource, string> = {
  'custom-fields': 'Site content and Extra fields',
  manual: 'Type it in (spreadsheet grid)',
  csv: 'Import a CSV or Excel file',
}

/** Hard limits. Documented in docs/tables-and-charts.md; the resolver and the editor both read them from here. */
export const LIMITS = {
  /** Documents read from a collection before filtering. */
  maxFetchedDocs: 1000,
  /** Rows a view may show or export. */
  maxRows: 500,
  /** Columns a view may have. */
  maxColumns: 24,
  /** Filter rules on one view. */
  maxFilters: 8,
  /** Longest filter value or label kept. */
  maxText: 200,
  /** Cells in a typed-in grid. */
  maxGridRows: 500,
  maxGridCols: 24,
  /** Longest single cell. */
  maxCell: 1000,
  /** Raw CSV text kept on a view. */
  maxCsvChars: 1_000_000,
  /** Chart categories and series drawn. */
  maxCategories: 60,
  maxSeries: 8,
  /** Chart height bounds in px. */
  minHeight: 160,
  maxHeight: 900,
} as const

export const CELL_FORMATS = ['auto', 'text', 'number', 'currency', 'percent', 'date'] as const
export type CellFormat = (typeof CELL_FORMATS)[number]

/** Safe comparison operators for filters. Nothing here is ever turned into SQL. */
export const FILTER_OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'greater', 'greaterOrEqual', 'less', 'lessOrEqual', 'isEmpty', 'notEmpty', 'in'] as const
export type FilterOperator = (typeof FILTER_OPERATORS)[number]

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'is',
  notEquals: 'is not',
  contains: 'contains',
  notContains: 'does not contain',
  greater: 'is more than',
  greaterOrEqual: 'is at least',
  less: 'is less than',
  lessOrEqual: 'is at most',
  isEmpty: 'is empty',
  notEmpty: 'is not empty',
  in: 'is one of (comma separated)',
}

export type FilterRule = { field: string; operator: FilterOperator; value: string }

export type ColumnSpec = {
  /** Built-in field key (`title`), custom field key (`cf:price`) or grid column key (`c0`). */
  key: string
  /** Heading shown to visitors. Blank uses the field's own label. */
  label: string
  format: CellFormat
  /** Digits after the decimal point for number, currency and percent. -1 means automatic. */
  decimals: number
  /** Currency code for currency format. */
  currency: string
}

export type SortSpec = { key: string; direction: 'asc' | 'desc' }

export type DataSourceConfig = {
  collection: string
  /** Built-in category/group filter (post category name, FAQ category). Blank means all. */
  category: string
  filters: FilterRule[]
  sort: SortSpec | null
  limit: number
}

export type GridConfig = {
  /** Treat the first row as headings. */
  headerRow: boolean
  rows: string[][]
}

export type DisplayOptions = {
  caption: string
  showHeader: boolean
  /** Repeat the headings under the last row. */
  footerRow: boolean
  zebra: boolean
  stickyHeader: boolean
  /** Visitors can click a heading to sort. */
  sortable: boolean
  searchable: boolean
  /** Rows per page. 0 shows every row. */
  pageSize: number
  responsive: 'scroll' | 'stacked'
  /** Add a row summing every numeric column. */
  totalsRow: boolean
  totalsLabel: string
}

export type ChartOptions = {
  /** Column key for the category axis (or the slice names). */
  x: string
  /** Column keys for the values. Pie and doughnut use the first. */
  y: string[]
  /** Optional column whose values become the series (long format data). */
  seriesBy: string
  aggregate: 'none' | 'sum' | 'count' | 'average'
  legend: boolean
  dataLabels: boolean
  xTitle: string
  yTitle: string
  stacked: boolean
  smooth: boolean
  height: number
}

export type DataViewDef = {
  id: number
  title: string
  slug: string | null
  kind: ViewKind
  source: ViewSource
  isPublic: boolean
  data: DataSourceConfig
  grid: GridConfig
  csvText: string
  columns: ColumnSpec[]
  display: DisplayOptions
  chart: ChartOptions
  updatedAt: string | null
}

export type Cell = string | number | boolean | null

export type ResolvedColumn = {
  key: string
  /** Heading shown to visitors. */
  label: string
  /** What the values are, which decides alignment, sorting, totals and chart use. */
  type: 'text' | 'number' | 'date'
  format: CellFormat
  decimals: number
  currency: string
}

export type TableData = {
  columns: ResolvedColumn[]
  rows: Cell[][]
  /** True when the data was cut at a limit. */
  truncated: boolean
}

/** What the renderers need: the saved view plus its resolved data. */
export type DataViewModel = {
  view: Pick<DataViewDef, 'id' | 'title' | 'slug' | 'kind' | 'display' | 'chart'>
  data: TableData
}
