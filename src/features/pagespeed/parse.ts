import {
  metricBand,
  type Band,
  type FieldData,
  type FieldMetric,
  type MetricKey,
  type Metrics,
  type PageSpeedReport,
  type Scores,
  type Suggestion,
} from './types'

/**
 * Turns a PageSpeed Insights v5 response into the small, safe report we store and show.
 * Everything is read defensively: the response is third-party JSON and only trusted for its shape,
 * never for its size. Titles are cut short and links stripped, and the lists are capped.
 */

type Loose = Record<string, unknown>

const obj = (value: unknown): Loose | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export const MAX_LIST = 8
const MAX_TITLE = 140
/** Stored JSON columns are trimmed to this many characters. */
export const MAX_JSON_CHARS = 8000

/** "Use [Learn more](https://...)" becomes "Use Learn more". Plain text only, no markup survives. */
export function cleanText(value: unknown, max = MAX_TITLE): string {
  const text = str(value)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1)}.` : text
}

const score100 = (value: unknown): number | null => {
  const n = num(value)
  return n === null ? null : Math.max(0, Math.min(100, Math.round(n * 100)))
}

const FIELD_BANDS: Record<string, Band> = { FAST: 'good', AVERAGE: 'needs-work', SLOW: 'poor' }

function labMetrics(audits: Loose): Metrics {
  const pick = (id: string, key: MetricKey): [MetricKey, { value: number; band: Band }] | null => {
    const value = num(obj(audits[id])?.numericValue)
    return value === null ? null : [key, { value, band: metricBand(key, value) }]
  }
  const entries = [
    pick('largest-contentful-paint', 'lcp'),
    pick('cumulative-layout-shift', 'cls'),
    pick('total-blocking-time', 'tbt'),
    pick('first-contentful-paint', 'fcp'),
    pick('server-response-time', 'ttfb'),
    pick('speed-index', 'speedIndex'),
  ].filter((entry): entry is [MetricKey, { value: number; band: Band }] => entry !== null)
  return Object.fromEntries(entries) as Metrics
}

function fieldMetric(metrics: Loose, id: string, key: 'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb'): [string, FieldMetric] | null {
  const entry = obj(metrics[id])
  const raw = num(entry?.percentile)
  if (raw === null) return null
  // CrUX reports CLS multiplied by 100.
  const percentile = key === 'cls' ? raw / 100 : raw
  const band = FIELD_BANDS[str(entry?.category)] ?? metricBand(key, percentile)
  return [key, { percentile, band }]
}

function parseFieldData(experience: unknown): FieldData | null {
  const root = obj(experience)
  const metrics = obj(root?.metrics)
  if (!root || !metrics) return null
  const entries = [
    fieldMetric(metrics, 'LARGEST_CONTENTFUL_PAINT_MS', 'lcp'),
    fieldMetric(metrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE', 'cls'),
    fieldMetric(metrics, 'INTERACTION_TO_NEXT_PAINT', 'inp'),
    fieldMetric(metrics, 'FIRST_CONTENTFUL_PAINT_MS', 'fcp'),
    fieldMetric(metrics, 'EXPERIMENTAL_TIME_TO_FIRST_BYTE', 'ttfb'),
  ].filter((entry): entry is [string, FieldMetric] => entry !== null)
  if (entries.length === 0) return null
  return {
    overall: FIELD_BANDS[str(root.overall_category)] ?? null,
    metrics: Object.fromEntries(entries) as FieldData['metrics'],
    originFallback: root.origin_fallback === true,
  }
}

function suggestion(id: string, audit: Loose): Suggestion {
  const details = obj(audit.details)
  const out: Suggestion = { id: id.slice(0, 60), title: cleanText(audit.title) }
  const ms = num(details?.overallSavingsMs)
  const bytes = num(details?.overallSavingsBytes)
  if (ms !== null && ms > 0) out.savingsMs = Math.round(ms)
  if (bytes !== null && bytes > 0) out.savingsBytes = Math.round(bytes)
  const display = cleanText(audit.displayValue, 80)
  if (display) out.displayValue = display
  return out
}

function parseSuggestions(audits: Loose, performanceRefs: unknown): { opportunities: Suggestion[]; diagnostics: Suggestion[] } {
  const refs = Array.isArray(performanceRefs) ? performanceRefs : []
  const opportunities: Suggestion[] = []
  const diagnostics: Suggestion[] = []
  for (const ref of refs) {
    const r = obj(ref)
    const id = str(r?.id)
    const audit = obj(audits[id])
    if (!r || !id || !audit) continue
    const score = num(audit.score)
    const mode = str(audit.scoreDisplayMode)
    const details = obj(audit.details)
    if (details?.type === 'opportunity' && (num(details.overallSavingsMs) ?? 0) > 0) {
      opportunities.push(suggestion(id, audit))
    } else if (str(r.group) === 'diagnostics' && (mode === 'numeric' || mode === 'binary') && score !== null && score < 0.9) {
      diagnostics.push(suggestion(id, audit))
    }
  }
  opportunities.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0))
  return { opportunities: opportunities.slice(0, MAX_LIST), diagnostics: diagnostics.slice(0, MAX_LIST) }
}

/** Returns null when the response has no Lighthouse result (a failed or empty run). */
export function parsePsiResponse(json: unknown): PageSpeedReport | null {
  const root = obj(json)
  const lighthouse = obj(root?.lighthouseResult)
  if (!lighthouse) return null
  const categories = obj(lighthouse.categories) ?? {}
  const audits = obj(lighthouse.audits) ?? {}
  const scores: Scores = {
    performance: score100(obj(categories.performance)?.score),
    accessibility: score100(obj(categories.accessibility)?.score),
    bestPractices: score100(obj(categories['best-practices'])?.score),
    seo: score100(obj(categories.seo)?.score),
  }
  if (scores.performance === null && scores.accessibility === null && scores.bestPractices === null && scores.seo === null) return null
  return {
    scores,
    metrics: labMetrics(audits),
    fieldData: parseFieldData(root?.loadingExperience),
    suggestions: parseSuggestions(audits, obj(categories.performance)?.auditRefs),
  }
}

/** JSON for a stored column, never longer than `max`. Drops list items from the end until it fits. */
export function safeJson(value: unknown, max = MAX_JSON_CHARS): string {
  let text = JSON.stringify(value) ?? 'null'
  if (text.length <= max) return text
  const copy = JSON.parse(text) as Loose
  for (let guard = 0; guard < 40 && text.length > max; guard++) {
    for (const key of ['diagnostics', 'opportunities']) {
      const list = copy[key]
      if (Array.isArray(list) && list.length > 0) {
        list.pop()
        text = JSON.stringify(copy)
        if (text.length <= max) return text
      }
    }
  }
  return text.length <= max ? text : '{}'
}
