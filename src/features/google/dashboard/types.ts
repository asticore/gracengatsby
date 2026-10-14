/**
 * Shared shapes for the Google dashboard widgets. Plain types only, so client components can import
 * this file without pulling in any server code.
 */

export type WidgetKind = 'search' | 'analytics' | 'speed' | 'adsense'

export const WIDGET_KINDS: readonly WidgetKind[] = ['search', 'analytics', 'speed', 'adsense']

export const isWidgetKind = (value: unknown): value is WidgetKind =>
  typeof value === 'string' && (WIDGET_KINDS as readonly string[]).includes(value)

export type DateRange = { from: string; to: string }

/** Every widget answers with one of these. The UI shows an honest message for each state. */
export type WidgetState<T> =
  | { state: 'ok'; data: T }
  | { state: 'not-connected' }
  | { state: 'not-set-up'; message: string }
  | { state: 'error'; message: string }

export type SearchTotals = {
  clicks: number
  impressions: number
  /** Click-through rate as a fraction, e.g. 0.031 for 3.1 percent. */
  ctr: number
  /** Average position in Google results. 1 is the top. */
  position: number
}

export type SearchRow = SearchTotals & { key: string }

export type SearchConsoleData = {
  site: string
  range: DateRange
  previousRange: DateRange
  current: SearchTotals
  previous: SearchTotals
  topQueries: SearchRow[]
  topPages: SearchRow[]
}

export type PageSearchData = {
  url: string
  range: DateRange
  totals: SearchTotals
  topQueries: SearchRow[]
}

export type AnalyticsTotals = { users: number; sessions: number }

export type AnalyticsData = {
  range: DateRange
  previousRange: DateRange
  current: AnalyticsTotals
  previous: AnalyticsTotals
  topPages: { path: string; views: number; users: number }[]
  sources: { channel: string; sessions: number; users: number }[]
}

export type SpeedSummary = {
  /** Pages with a stored mobile test. */
  tested: number
  /** Average mobile performance score across those pages, 0 to 100, or null when none. */
  averagePerformance: number | null
  /** Lowest-scoring pages first. */
  worst: { collection: string; docId: number; url: string; performance: number; editHref: string }[]
}

export type AdSenseData = {
  range: DateRange
  currency: string
  earnings: number
  pageViews: number
  clicks: number
}

export type PageStatsResult =
  | { state: 'ok'; data: PageSearchData }
  | { state: 'not-connected' }
  | { state: 'not-set-up'; message: string }
  | { state: 'unpublished'; message: string }
  | { state: 'error'; message: string }
