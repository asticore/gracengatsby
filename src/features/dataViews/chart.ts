import { formatCell, parseNumber } from './format'
import { LIMITS, type ChartOptions, type ResolvedColumn, type TableData, type ViewKind } from './types'

/**
 * Turns table data plus chart options into drawing instructions: numbers and path strings made only
 * of digits, plus text labels. The SVG component (components/ChartSvg.tsx) draws them; text goes
 * through React, which escapes it. Nothing a content editor typed is ever placed in an attribute or
 * path, so a label such as `"><script>` can only ever appear as text.
 */

export const CHART_WIDTH = 640
export const PALETTE_SIZE = 8

export type Tick = { value: number; pos: number; label: string }

export type Mark = {
  /** Text for the hover tooltip and the native <title>. */
  tip: string
  /** Pixel position and size of the mark. */
  x: number
  y: number
  width: number
  height: number
}

export type Series = { name: string; color: number; values: (number | null)[] }

export type CartesianModel = {
  type: 'cartesian'
  kind: 'bar' | 'line' | 'area'
  width: number
  height: number
  plot: { left: number; top: number; width: number; height: number }
  categories: string[]
  /** Category labels that fit, with their x position. */
  xLabels: { label: string; x: number; index: number }[]
  series: Series[]
  yTicks: Tick[]
  bars: (Mark & { series: number; color: number; label: string | null })[]
  lines: { series: number; color: number; path: string; areaPath: string | null; points: (Mark & { label: string | null })[] }[]
  xTitle: string
  yTitle: string
  baselineY: number
  stacked: boolean
}

export type PieModel = {
  type: 'pie'
  width: number
  height: number
  cx: number
  cy: number
  radius: number
  innerRadius: number
  slices: { label: string; value: number; fraction: number; color: number; path: string; tip: string; labelX: number; labelY: number; showLabel: boolean }[]
  total: number
  totalLabel: string
}

export type ScatterModel = {
  type: 'scatter'
  width: number
  height: number
  plot: { left: number; top: number; width: number; height: number }
  series: { name: string; color: number; points: Mark[] }[]
  xTicks: Tick[]
  yTicks: Tick[]
  xTitle: string
  yTitle: string
}

export type EmptyModel = { type: 'empty'; message: string }

export type ChartModel = CartesianModel | PieModel | ScatterModel | EmptyModel

const round = (value: number): number => Math.round(value * 100) / 100

export function niceStep(range: number, targetTicks: number): number {
  if (!(range > 0)) return 1
  const rough = range / Math.max(1, targetTicks)
  const power = Math.pow(10, Math.floor(Math.log10(rough)))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * power
}

/** Axis bounds and tick values that include `min` and `max` and land on round numbers. */
export function niceScale(min: number, max: number, targetTicks = 5): { min: number; max: number; ticks: number[] } {
  let low = min
  let high = max
  if (low === high) {
    if (low === 0) high = 1
    else {
      low = Math.min(low, 0)
      high = Math.max(high, 0) === low ? low + 1 : Math.max(high, 0)
    }
  }
  const step = niceStep(high - low, targetTicks)
  const start = Math.floor(low / step) * step
  const end = Math.ceil(high / step) * step
  const ticks: number[] = []
  for (let value = start, guard = 0; value <= end + step / 1000 && guard < 50; value += step, guard++) ticks.push(round(value))
  return { min: ticks[0] ?? 0, max: ticks[ticks.length - 1] ?? 1, ticks }
}

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 3)}...` : text)

type Prepared = { categories: string[]; series: Series[]; xColumn: ResolvedColumn | null; yColumn: ResolvedColumn | null }

const isNumeric = (column: ResolvedColumn): boolean => column.type === 'number'

/** Picks the category column, the value columns and groups rows the way the options ask. */
export function prepareSeries(data: TableData, options: ChartOptions): Prepared {
  const byKey = new Map(data.columns.map((column, index) => [column.key, { column, index }]))
  const xEntry = byKey.get(options.x) ?? (data.columns[0] ? { column: data.columns[0], index: 0 } : null)
  if (!xEntry) return { categories: [], series: [], xColumn: null, yColumn: null }

  let yEntries = options.y.map((key) => byKey.get(key)).filter((entry): entry is { column: ResolvedColumn; index: number } => Boolean(entry) && entry!.column.key !== xEntry.column.key)
  if (yEntries.length === 0) {
    yEntries = data.columns
      .map((column, index) => ({ column, index }))
      .filter((entry) => entry.column.key !== xEntry.column.key && isNumeric(entry.column))
      .slice(0, LIMITS.maxSeries)
  }
  const seriesEntry = options.seriesBy ? byKey.get(options.seriesBy) : undefined
  const xLabel = (row: TableData['rows'][number]): string => formatCell(row[xEntry.index] ?? null, xEntry.column) || '(blank)'
  const counting = options.aggregate === 'count'
  const grouping = options.aggregate !== 'none' || Boolean(seriesEntry)
  const yColumn = yEntries[0]?.column ?? null

  if (!counting && yEntries.length === 0) return { categories: [], series: [], xColumn: xEntry.column, yColumn: null }

  // Row per category: no grouping.
  if (!grouping) {
    const rows = data.rows.slice(0, LIMITS.maxCategories)
    return {
      categories: rows.map(xLabel),
      series: yEntries.slice(0, LIMITS.maxSeries).map((entry, i) => ({ name: entry.column.label, color: i, values: rows.map((row) => parseNumber(row[entry.index] ?? null)) })),
      xColumn: xEntry.column,
      yColumn,
    }
  }

  const categoryOrder: string[] = []
  const seriesOrder: string[] = []
  const sums = new Map<string, { total: number; count: number }>()
  const keyOf = (category: string, series: string): string => `${category}\u0000${series}`
  const pickValue = (row: TableData['rows'][number]): number | null => (counting ? 1 : parseNumber(row[yEntries[0]!.index] ?? null))
  for (const row of data.rows) {
    const category = xLabel(row)
    const seriesName = seriesEntry ? formatCell(row[seriesEntry.index] ?? null, seriesEntry.column) || '(blank)' : counting ? 'Count' : yEntries[0]!.column.label
    if (!categoryOrder.includes(category)) categoryOrder.push(category)
    if (!seriesOrder.includes(seriesName)) seriesOrder.push(seriesName)
    const value = pickValue(row)
    if (value === null) continue
    const key = keyOf(category, seriesName)
    const entry = sums.get(key) ?? { total: 0, count: 0 }
    entry.total += value
    entry.count += 1
    sums.set(key, entry)
  }
  const categories = categoryOrder.slice(0, LIMITS.maxCategories)
  const series = seriesOrder.slice(0, LIMITS.maxSeries).map((name, i) => ({
    name,
    color: i,
    values: categories.map((category) => {
      const entry = sums.get(keyOf(category, name))
      if (!entry) return null
      return options.aggregate === 'average' ? entry.total / entry.count : entry.total
    }),
  }))
  return { categories, series, xColumn: xEntry.column, yColumn: counting ? null : yColumn }
}

const valueFormatter = (column: ResolvedColumn | null) => (value: number): string => (column ? formatCell(value, { ...column, type: 'number' }) : String(round(value)))

function buildCartesian(kind: 'bar' | 'line' | 'area', prepared: Prepared, options: ChartOptions): ChartModel {
  const { categories, series } = prepared
  const height = options.height
  const fmt = valueFormatter(prepared.yColumn)
  const stacked = options.stacked && (kind === 'bar' || kind === 'area') && series.length > 1

  const left = 56 + (options.yTitle ? 18 : 0)
  const right = 16
  const top = 14
  const bottom = 34 + (options.xTitle ? 18 : 0)
  const plot = { left, top, width: CHART_WIDTH - left - right, height: height - top - bottom }

  // Value range, including stacking.
  let min = 0
  let max = 0
  categories.forEach((_, ci) => {
    let positive = 0
    let negative = 0
    for (const s of series) {
      const v = s.values[ci]
      if (v === null || v === undefined) continue
      if (stacked) {
        if (v >= 0) positive += v
        else negative += v
      } else {
        max = Math.max(max, v)
        min = Math.min(min, v)
      }
    }
    if (stacked) {
      max = Math.max(max, positive)
      min = Math.min(min, negative)
    }
  })
  const scale = niceScale(min, max)
  const span = scale.max - scale.min || 1
  const yOf = (value: number): number => round(plot.top + plot.height - ((value - scale.min) / span) * plot.height)
  const baselineY = yOf(Math.max(0, scale.min))

  const count = categories.length
  const band = plot.width / Math.max(1, count)
  const xCenter = (i: number): number => round(plot.left + band * i + band / 2)

  const yTicks: Tick[] = scale.ticks.map((value) => ({ value, pos: yOf(value), label: fmt(value) }))

  // Category labels that fit.
  const labelWidth = 7 * Math.min(14, Math.max(...categories.map((c) => c.length), 1)) + 8
  const every = Math.max(1, Math.ceil(labelWidth / band))
  const xLabels = categories.map((label, index) => ({ label: truncate(label, 14), x: xCenter(index), index })).filter((l) => l.index % every === 0)

  const bars: CartesianModel['bars'] = []
  const lines: CartesianModel['lines'] = []

  if (kind === 'bar') {
    const groupWidth = band * 0.72
    const barWidth = stacked ? groupWidth : groupWidth / Math.max(1, series.length)
    categories.forEach((category, ci) => {
      let positive = 0
      let negative = 0
      series.forEach((s, si) => {
        const v = s.values[ci]
        if (v === null || v === undefined) return
        const x = round(stacked ? xCenter(ci) - groupWidth / 2 : xCenter(ci) - groupWidth / 2 + barWidth * si)
        let from: number
        let to: number
        if (stacked) {
          if (v >= 0) {
            from = positive
            positive += v
            to = positive
          } else {
            from = negative
            negative += v
            to = negative
          }
        } else {
          from = 0
          to = v
        }
        const y1 = yOf(Math.max(from, to))
        const y2 = yOf(Math.min(from, to))
        bars.push({
          series: si,
          color: s.color,
          label: options.dataLabels ? fmt(v) : null,
          tip: `${category}${series.length > 1 ? ` - ${s.name}` : ''}: ${fmt(v)}`,
          x,
          y: y1,
          width: round(Math.max(1, barWidth - (series.length > 1 && !stacked ? 2 : 0))),
          height: round(Math.max(1, y2 - y1)),
        })
      })
    })
  } else {
    const cumulative = new Array<number>(count).fill(0)
    series.forEach((s, si) => {
      const pts: { x: number; y: number; base: number; value: number; ci: number }[] = []
      s.values.forEach((v, ci) => {
        if (v === null || v === undefined) return
        const base = stacked ? cumulative[ci]! : 0
        const top2 = stacked ? base + v : v
        if (stacked) cumulative[ci] = top2
        pts.push({ x: xCenter(ci), y: yOf(top2), base: yOf(base), value: v, ci })
      })
      if (pts.length === 0) return
      let path = `M${pts[0]!.x} ${pts[0]!.y}`
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!
        const b = pts[i]!
        if (options.smooth) {
          const mid = round((a.x + b.x) / 2)
          path += ` C${mid} ${a.y} ${mid} ${b.y} ${b.x} ${b.y}`
        } else path += ` L${b.x} ${b.y}`
      }
      let areaPath: string | null = null
      if (kind === 'area') {
        const closeY = stacked ? null : baselineY
        let back = ''
        if (closeY !== null) back = ` L${pts[pts.length - 1]!.x} ${closeY} L${pts[0]!.x} ${closeY} Z`
        else {
          for (let i = pts.length - 1; i >= 0; i--) back += ` L${pts[i]!.x} ${pts[i]!.base}`
          back += ' Z'
        }
        areaPath = path + back
      }
      lines.push({
        series: si,
        color: s.color,
        path,
        areaPath,
        points: pts.map((p) => ({
          tip: `${categories[p.ci]}${series.length > 1 ? ` - ${s.name}` : ''}: ${fmt(p.value)}`,
          label: options.dataLabels ? fmt(p.value) : null,
          x: p.x,
          y: p.y,
          width: 0,
          height: 0,
        })),
      })
    })
  }

  return { type: 'cartesian', kind, width: CHART_WIDTH, height, plot, categories, xLabels, series, yTicks, bars, lines, xTitle: options.xTitle, yTitle: options.yTitle, baselineY, stacked }
}

function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [round(cx + radius * Math.sin(angle)), round(cy - radius * Math.cos(angle))]
}

function buildPie(kind: 'pie' | 'doughnut', prepared: Prepared, options: ChartOptions): ChartModel {
  const first = prepared.series[0]
  if (!first) return { type: 'empty', message: 'Choose a column with numbers for the slices.' }
  const fmt = valueFormatter(prepared.yColumn)
  let items = prepared.categories.map((label, i) => ({ label, value: first.values[i] ?? 0 })).filter((item) => item.value > 0)
  const MAX_SLICES = 12
  if (items.length > MAX_SLICES) {
    const rest = items.slice(MAX_SLICES - 1)
    items = [...items.slice(0, MAX_SLICES - 1), { label: 'Other', value: rest.reduce((sum, item) => sum + item.value, 0) }]
  }
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0) return { type: 'empty', message: 'There are no positive values to draw.' }

  const height = options.height
  const radius = Math.max(40, Math.min(CHART_WIDTH, height) / 2 - 24)
  const cx = CHART_WIDTH / 2
  const cy = height / 2
  const innerRadius = kind === 'doughnut' ? round(radius * 0.58) : 0

  let angle = 0
  const slices: PieModel['slices'] = items.map((item, i) => {
    const fraction = item.value / total
    const start = angle
    const end = angle + fraction * Math.PI * 2
    angle = end
    const full = fraction > 0.9999
    let path: string
    if (full) {
      // A full circle cannot be one arc; draw two halves.
      const [ax, ay] = polar(cx, cy, radius, 0)
      const [bx, by] = polar(cx, cy, radius, Math.PI)
      path = `M${ax} ${ay} A${radius} ${radius} 0 1 1 ${bx} ${by} A${radius} ${radius} 0 1 1 ${ax} ${ay} Z`
      if (innerRadius > 0) {
        const [cx1, cy1] = polar(cx, cy, innerRadius, 0)
        const [dx, dy] = polar(cx, cy, innerRadius, Math.PI)
        path += ` M${cx1} ${cy1} A${innerRadius} ${innerRadius} 0 1 0 ${dx} ${dy} A${innerRadius} ${innerRadius} 0 1 0 ${cx1} ${cy1} Z`
      }
    } else {
      const large = end - start > Math.PI ? 1 : 0
      const [x1, y1] = polar(cx, cy, radius, start)
      const [x2, y2] = polar(cx, cy, radius, end)
      if (innerRadius > 0) {
        const [x3, y3] = polar(cx, cy, innerRadius, end)
        const [x4, y4] = polar(cx, cy, innerRadius, start)
        path = `M${x1} ${y1} A${radius} ${radius} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${innerRadius} ${innerRadius} 0 ${large} 0 ${x4} ${y4} Z`
      } else path = `M${cx} ${cy} L${x1} ${y1} A${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
    }
    const mid = (start + end) / 2
    const labelRadius = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.65
    const [labelX, labelY] = polar(cx, cy, labelRadius, mid)
    const percent = Math.round(fraction * 1000) / 10
    return { label: item.label, value: item.value, fraction, color: i, path, tip: `${item.label}: ${fmt(item.value)} (${percent}%)`, labelX, labelY, showLabel: options.dataLabels && fraction >= 0.04 }
  })
  return { type: 'pie', width: CHART_WIDTH, height, cx, cy, radius, innerRadius, slices, total, totalLabel: fmt(total) }
}

function buildScatter(data: TableData, options: ChartOptions): ChartModel {
  const numeric = data.columns.map((column, index) => ({ column, index })).filter((entry) => isNumeric(entry.column))
  const xEntry = numeric.find((entry) => entry.column.key === options.x) ?? numeric[0]
  if (!xEntry) return { type: 'empty', message: 'A scatter plot needs at least two columns of numbers.' }
  let yEntries = options.y.map((key) => numeric.find((entry) => entry.column.key === key)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && entry!.index !== xEntry.index)
  if (yEntries.length === 0) yEntries = numeric.filter((entry) => entry.index !== xEntry.index).slice(0, 1)
  if (yEntries.length === 0) return { type: 'empty', message: 'A scatter plot needs at least two columns of numbers.' }
  yEntries = yEntries.slice(0, LIMITS.maxSeries)

  const fmtX = valueFormatter(xEntry.column)
  const fmtY = valueFormatter(yEntries[0]!.column)
  const height = options.height
  const left = 56 + (options.yTitle ? 18 : 0)
  const bottom = 34 + (options.xTitle ? 18 : 0)
  const plot = { left, top: 14, width: CHART_WIDTH - left - 16, height: height - 14 - bottom }

  const rows = data.rows.slice(0, LIMITS.maxRows)
  const xs: number[] = []
  const ys: number[] = []
  for (const row of rows) {
    const x = parseNumber(row[xEntry.index] ?? null)
    if (x === null) continue
    xs.push(x)
    for (const entry of yEntries) {
      const y = parseNumber(row[entry.index] ?? null)
      if (y !== null) ys.push(y)
    }
  }
  if (xs.length === 0 || ys.length === 0) return { type: 'empty', message: 'There are no numbers to plot.' }
  const xScale = niceScale(Math.min(...xs), Math.max(...xs))
  const yScale = niceScale(Math.min(...ys), Math.max(...ys))
  const xSpan = xScale.max - xScale.min || 1
  const ySpan = yScale.max - yScale.min || 1
  const px = (v: number): number => round(plot.left + ((v - xScale.min) / xSpan) * plot.width)
  const py = (v: number): number => round(plot.top + plot.height - ((v - yScale.min) / ySpan) * plot.height)

  const series = yEntries.map((entry, si) => ({
    name: entry.column.label,
    color: si,
    points: rows
      .map((row) => ({ x: parseNumber(row[xEntry.index] ?? null), y: parseNumber(row[entry.index] ?? null) }))
      .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null)
      .map((p) => ({ tip: `${xEntry.column.label} ${fmtX(p.x)}, ${entry.column.label} ${fmtY(p.y)}`, x: px(p.x), y: py(p.y), width: 0, height: 0 })),
  }))
  return {
    type: 'scatter',
    width: CHART_WIDTH,
    height,
    plot,
    series,
    xTicks: xScale.ticks.map((value) => ({ value, pos: px(value), label: fmtX(value) })),
    yTicks: yScale.ticks.map((value) => ({ value, pos: py(value), label: fmtY(value) })),
    xTitle: options.xTitle || xEntry.column.label,
    yTitle: options.yTitle,
  }
}

/** Builds the drawing for a chart kind. The `table` kind has no chart model. */
export function buildChart(kind: ViewKind, data: TableData, options: ChartOptions): ChartModel {
  if (kind === 'table') return { type: 'empty', message: '' }
  if (data.rows.length === 0 || data.columns.length === 0) return { type: 'empty', message: 'There is no data to chart yet.' }
  if (kind === 'scatter') return buildScatter(data, options)

  const prepared = prepareSeries(data, options)
  if (prepared.categories.length === 0 || prepared.series.length === 0) return { type: 'empty', message: 'Choose a column for the labels and at least one column of numbers.' }
  if (prepared.series.every((s) => s.values.every((v) => v === null))) return { type: 'empty', message: 'The chosen columns have no numbers in them.' }
  if (kind === 'pie' || kind === 'doughnut') return buildPie(kind, prepared, options)
  return buildCartesian(kind, prepared, options)
}

/** Series names for the legend, in drawing order. */
export function legendItems(model: ChartModel): { name: string; color: number }[] {
  if (model.type === 'cartesian') return model.series.map((s) => ({ name: s.name, color: s.color }))
  if (model.type === 'scatter') return model.series.map((s) => ({ name: s.name, color: s.color }))
  if (model.type === 'pie') return model.slices.map((s) => ({ name: s.label, color: s.color }))
  return []
}

export const paletteVar = (index: number): string => `var(--dv-c${(index % PALETTE_SIZE) + 1})`
