import { adsenseAccountOrNull, checkConnection, type EngineArg } from './connection'
import { cached } from './cache'
import { recentWindows } from './ranges'
import { liveRequester, type GoogleRequester } from './requester'
import { errorMessage, list, num, text } from './shapeUtil'
import type { AdSenseData, DateRange, WidgetState } from './types'

/**
 * AdSense earnings for the last 28 days, from the AdSense Management API (accounts.reports.generate).
 * Read-only: the connection only asks for adsense.readonly.
 */

const METRICS = ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'CLICKS']

const ymd = (day: string) => {
  const [year, month, date] = day.split('-').map((part) => Number(part))
  return { year, month, day: date }
}

/** The report URL: a custom date range plus the three metrics. Built here, never from the browser. */
export function reportUrl(account: string, range: DateRange): string {
  const params = new URLSearchParams()
  params.set('dateRange', 'CUSTOM')
  const start = ymd(range.from)
  const end = ymd(range.to)
  params.set('startDate.year', String(start.year))
  params.set('startDate.month', String(start.month))
  params.set('startDate.day', String(start.day))
  params.set('endDate.year', String(end.year))
  params.set('endDate.month', String(end.month))
  params.set('endDate.day', String(end.day))
  for (const metric of METRICS) params.append('metrics', metric)
  return `https://adsense.googleapis.com/v2/${account}/reports:generate?${params.toString()}`
}

/** Pure: reads the totals row, matching each cell to its header name. Missing values count as zero. */
export function shapeAdSense(json: unknown, range: DateRange): AdSenseData {
  const body = json as { headers?: unknown; totals?: { cells?: unknown }; currencyCode?: unknown } | null
  const headers = list(body?.headers).map((h) => text((h as { name?: unknown }).name))
  const cells = list(body?.totals?.cells)
  const valueOf = (name: string): number => {
    const index = headers.indexOf(name)
    return index >= 0 ? num((cells[index] as { value?: unknown } | undefined)?.value) : 0
  }
  return {
    range,
    currency: text(body?.currencyCode),
    earnings: valueOf('ESTIMATED_EARNINGS'),
    pageViews: valueOf('PAGE_VIEWS'),
    clicks: valueOf('CLICKS'),
  }
}

export const NOT_SET_UP = 'Choose an AdSense account under Google connection first.'

export async function loadAdSenseWidget(
  engine: EngineArg,
  today: Date = new Date(),
  req: GoogleRequester = liveRequester,
): Promise<WidgetState<AdSenseData>> {
  const check = await checkConnection(engine)
  if (!check.connected) return { state: 'not-connected' }
  const account = adsenseAccountOrNull(check.info.adsenseAccountId, check.info.adsensePublisherId)
  if (!account) return { state: 'not-set-up', message: NOT_SET_UP }
  const { range } = recentWindows(today)
  try {
    const data = await cached(
      `adsense:${account}`,
      async () => shapeAdSense(await req.get(engine, reportUrl(account, range)), range),
      () => true,
    )
    return { state: 'ok', data }
  } catch (error) {
    return { state: 'error', message: errorMessage(error) }
  }
}
