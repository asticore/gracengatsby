import { checkConnection, ga4PropertyNumber, type EngineArg } from './connection'
import { cached } from './cache'
import { recentWindows } from './ranges'
import { liveRequester, type GoogleRequester } from './requester'
import { errorMessage, list, num, text } from './shapeUtil'
import type { AnalyticsData, DateRange, WidgetState } from './types'

/**
 * GA4 through the Analytics Data API (runReport): users and sessions for the last 28 days against the
 * 28 days before, the top pages and where visitors came from. Pure shapers first, then the loader.
 */

const RUN_REPORT = (property: string) => `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`
const TOP = 10

type ReportRow = { dims: string[]; metrics: number[] }

/** Flattens a runReport response into plain dimension and metric values. */
export function shapeReport(json: unknown): ReportRow[] {
  return list((json as { rows?: unknown } | null)?.rows).map((raw) => {
    const row = raw as { dimensionValues?: unknown; metricValues?: unknown }
    return {
      dims: list(row.dimensionValues).map((v) => text((v as { value?: unknown }).value)),
      metrics: list(row.metricValues).map((v) => num((v as { value?: unknown }).value)),
    }
  })
}

/** Users and sessions for the window named "current" or "previous" (sent as the dateRange dimension). */
export function totalsFor(rows: ReportRow[], name: 'current' | 'previous'): { users: number; sessions: number } {
  const row = rows.find((r) => r.dims[0] === name)
  return { users: row?.metrics[0] ?? 0, sessions: row?.metrics[1] ?? 0 }
}

const gaWindow = (range: DateRange) => ({ startDate: range.from, endDate: range.to })

/** Full GA4 report for one property. Three requests, run together. */
export async function fetchAnalytics(
  engine: EngineArg,
  property: string,
  today: Date,
  req: GoogleRequester = liveRequester,
): Promise<AnalyticsData> {
  const { range, previousRange } = recentWindows(today)
  const url = RUN_REPORT(property)
  const [totals, pages, sources] = await Promise.all([
    req.post(engine, url, {
      dateRanges: [
        { ...gaWindow(range), name: 'current' },
        { ...gaWindow(previousRange), name: 'previous' },
      ],
      dimensions: [{ name: 'dateRange' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    }),
    req.post(engine, url, {
      dateRanges: [gaWindow(range)],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: TOP,
    }),
    req.post(engine, url, {
      dateRanges: [gaWindow(range)],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: TOP,
    }),
  ])
  const totalRows = shapeReport(totals)
  return {
    range,
    previousRange,
    current: totalsFor(totalRows, 'current'),
    previous: totalsFor(totalRows, 'previous'),
    topPages: shapeReport(pages).map((r) => ({ path: r.dims[0] || '/', views: r.metrics[0] ?? 0, users: r.metrics[1] ?? 0 })),
    sources: shapeReport(sources).map((r) => ({ channel: r.dims[0] || 'Unknown', sessions: r.metrics[0] ?? 0, users: r.metrics[1] ?? 0 })),
  }
}

export const NOT_SET_UP = 'Choose a GA4 property under Google connection first.'

/** The GA4 widget: connection check, property check, then the five-minute cache. */
export async function loadAnalyticsWidget(
  engine: EngineArg,
  today: Date = new Date(),
  req: GoogleRequester = liveRequester,
): Promise<WidgetState<AnalyticsData>> {
  const check = await checkConnection(engine)
  if (!check.connected) return { state: 'not-connected' }
  const property = ga4PropertyNumber(check.info.ga4PropertyId)
  if (!property) return { state: 'not-set-up', message: NOT_SET_UP }
  try {
    const data = await cached(`analytics:${property}`, () => fetchAnalytics(engine, property, today, req), () => true)
    return { state: 'ok', data }
  } catch (error) {
    return { state: 'error', message: errorMessage(error) }
  }
}
