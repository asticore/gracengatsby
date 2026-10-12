/**
 * PageSpeed Insights: shared types and the pure scoring helpers (no I/O, safe on server and client).
 */

export const PAGESPEED_COLLECTIONS = ['pages', 'posts', 'products', 'events'] as const
export type PageSpeedCollection = (typeof PAGESPEED_COLLECTIONS)[number]

export const STRATEGIES = ['mobile', 'desktop'] as const
export type Strategy = (typeof STRATEGIES)[number]

export const PAGESPEED_RESULTS_TABLE = 'eg_pagespeed_results'
export const PAGESPEED_QUEUE_TABLE = 'eg_pagespeed_queue'

/** Table that holds each collection's rows, for the denormalised score columns. */
export const COLLECTION_TABLES: Record<PageSpeedCollection, string> = {
  pages: 'eg_pages',
  posts: 'eg_posts',
  products: 'eg_products',
  events: 'eg_events',
}

export const isPageSpeedCollection = (value: unknown): value is PageSpeedCollection =>
  typeof value === 'string' && (PAGESPEED_COLLECTIONS as readonly string[]).includes(value)

export const isStrategy = (value: unknown): value is Strategy => value === 'mobile' || value === 'desktop'

export type Band = 'good' | 'needs-work' | 'poor'

export type Scores = {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export type MetricKey = 'lcp' | 'cls' | 'inp' | 'tbt' | 'fcp' | 'ttfb' | 'speedIndex'

export type MetricValue = { value: number; band: Band }

export type Metrics = Partial<Record<MetricKey, MetricValue>>

export type FieldMetric = { percentile: number; band: Band }

/** Real-user data from the Chrome UX Report. Only present for pages with enough traffic. */
export type FieldData = {
  overall: Band | null
  metrics: Partial<Record<'lcp' | 'cls' | 'inp' | 'fcp' | 'ttfb', FieldMetric>>
  /** True when the figures describe the whole origin rather than this one URL. */
  originFallback: boolean
}

export type Suggestion = {
  id: string
  title: string
  /** Estimated time saved, in ms. */
  savingsMs?: number
  /** Estimated bytes saved. */
  savingsBytes?: number
  /** Short display text from Lighthouse, e.g. "Potential savings of 120 KiB". */
  displayValue?: string
}

export type Suggestions = { opportunities: Suggestion[]; diagnostics: Suggestion[] }

export type PageSpeedReport = {
  scores: Scores
  metrics: Metrics
  fieldData: FieldData | null
  suggestions: Suggestions
}

export type StoredResult = PageSpeedReport & {
  id: number
  collection: PageSpeedCollection
  docId: number
  url: string
  strategy: Strategy
  source: 'manual' | 'auto'
  fetchedAt: string
}

/** Lighthouse bands: 90+ green, 50-89 amber, under 50 red. */
export function scoreBand(score: number | null | undefined): Band | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  if (score >= 90) return 'good'
  if (score >= 50) return 'needs-work'
  return 'poor'
}

/** Thresholds from web.dev: at or below `good` is good, above `poor` is poor. */
export const THRESHOLDS: Record<MetricKey, { good: number; poor: number; unit: 'ms' | 'unitless'; label: string; help: string }> = {
  lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint', help: 'How long until the biggest thing on screen (usually the main image or heading) has appeared. Good is 2.5 s or less.' },
  cls: { good: 0.1, poor: 0.25, unit: 'unitless', label: 'Cumulative Layout Shift', help: 'How much the page jumps around while loading. Good is 0.1 or less.' },
  inp: { good: 200, poor: 500, unit: 'ms', label: 'Interaction to Next Paint', help: 'How quickly the page reacts to taps and clicks. Only measured from real visitors. Good is 200 ms or less.' },
  tbt: { good: 200, poor: 600, unit: 'ms', label: 'Total Blocking Time', help: 'How long the page is frozen and cannot respond while it loads (a lab stand-in for INP). Good is 200 ms or less.' },
  fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint', help: 'How long until anything at all appears. Good is 1.8 s or less.' },
  ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'Server response (TTFB)', help: 'How long the server takes to start sending the page. Good is 0.8 s or less.' },
  speedIndex: { good: 3400, poor: 5800, unit: 'ms', label: 'Speed Index', help: 'How quickly the visible part of the page fills in. Good is 3.4 s or less.' },
}

export function metricBand(key: MetricKey, value: number): Band {
  const t = THRESHOLDS[key]
  if (value <= t.good) return 'good'
  if (value <= t.poor) return 'needs-work'
  return 'poor'
}

/** Human text for a metric: seconds for time, a plain number for CLS. */
export function formatMetric(key: MetricKey, value: number): string {
  if (THRESHOLDS[key].unit === 'unitless') return String(Number(value.toFixed(3)))
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`
  return `${Math.round(value)} ms`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round(bytes)} B`
}

export type Delta = { change: number; direction: 'up' | 'down' | 'same' }

/** Compare a score with the previous run. Higher is better for scores. */
export function scoreDelta(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null
  const change = current - previous
  return { change, direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same' }
}
