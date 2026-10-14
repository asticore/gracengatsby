import { checkConnection, searchSiteOrNull, type EngineArg } from './connection'
import { cached } from './cache'
import { searchWindows } from './ranges'
import { liveRequester, type GoogleRequester } from './requester'
import { errorMessage, list, num, text } from './shapeUtil'
import type { DateRange, PageSearchData, SearchConsoleData, SearchRow, SearchTotals, WidgetState } from './types'

/**
 * Search Console: clicks, impressions, CTR and position for the last 28 days against the 28 days before,
 * plus the top queries and pages. Pure shapers first, then the loaders the routes call.
 */

const API = 'https://www.googleapis.com/webmasters/v3/sites'
const TOP = 10

type Filter = { dimensionFilterGroups?: unknown[] }

const searchUrl = (site: string): string => `${API}/${encodeURIComponent(site)}/searchAnalytics/query`

/** Sums the rows of a totals query (one row, or none when there was no traffic). */
export function shapeTotals(json: unknown): SearchTotals {
  const rows = list((json as { rows?: unknown } | null)?.rows)
  let clicks = 0
  let impressions = 0
  let weightedPosition = 0
  for (const raw of rows) {
    const row = raw as { clicks?: unknown; impressions?: unknown; position?: unknown }
    clicks += num(row.clicks)
    impressions += num(row.impressions)
    weightedPosition += num(row.position) * num(row.impressions)
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPosition / impressions : 0,
  }
}

/** Top rows of a query grouped by one dimension (query or page). */
export function shapeRows(json: unknown, limit = TOP): SearchRow[] {
  return list((json as { rows?: unknown } | null)?.rows)
    .slice(0, limit)
    .map((raw) => {
      const row = raw as { keys?: unknown; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown }
      return {
        key: text(list(row.keys)[0]),
        clicks: num(row.clicks),
        impressions: num(row.impressions),
        ctr: num(row.ctr),
        position: num(row.position),
      }
    })
}

const window = (range: DateRange) => ({ startDate: range.from, endDate: range.to })

/** The full site-wide report: two totals windows plus the top queries and pages. */
export async function fetchSearchConsole(
  engine: EngineArg,
  site: string,
  today: Date,
  req: GoogleRequester = liveRequester,
): Promise<SearchConsoleData> {
  const { range, previousRange } = searchWindows(today)
  const url = searchUrl(site)
  const [current, previous, queries, pages] = await Promise.all([
    req.post(engine, url, window(range)),
    req.post(engine, url, window(previousRange)),
    req.post(engine, url, { ...window(range), dimensions: ['query'], rowLimit: TOP }),
    req.post(engine, url, { ...window(range), dimensions: ['page'], rowLimit: TOP }),
  ])
  return {
    site,
    range,
    previousRange,
    current: shapeTotals(current),
    previous: shapeTotals(previous),
    topQueries: shapeRows(queries),
    topPages: shapeRows(pages),
  }
}

/** One page's numbers: only the rows whose page address equals `url` exactly. */
export async function fetchPageSearch(
  engine: EngineArg,
  site: string,
  url: string,
  today: Date,
  req: GoogleRequester = liveRequester,
): Promise<PageSearchData> {
  const { range } = searchWindows(today)
  const filter: Filter = {
    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: url }] }],
  }
  const endpoint = searchUrl(site)
  const [totals, queries] = await Promise.all([
    req.post(engine, endpoint, { ...window(range), ...filter }),
    req.post(engine, endpoint, { ...window(range), ...filter, dimensions: ['query'], rowLimit: TOP }),
  ])
  return { url, range, totals: shapeTotals(totals), topQueries: shapeRows(queries) }
}

export const NOT_SET_UP = 'Choose a Search Console property under Google connection first.'

/** The site-wide widget: checks the connection, then reads through the five-minute cache. */
export async function loadSearchWidget(
  engine: EngineArg,
  today: Date = new Date(),
  req: GoogleRequester = liveRequester,
): Promise<WidgetState<SearchConsoleData>> {
  const check = await checkConnection(engine)
  if (!check.connected) return { state: 'not-connected' }
  const site = searchSiteOrNull(check.info.searchConsoleSite)
  if (!site) return { state: 'not-set-up', message: NOT_SET_UP }
  try {
    const data = await cached(
      `search:${site}`,
      () => fetchSearchConsole(engine, site, today, req),
      () => true,
    )
    return { state: 'ok', data }
  } catch (error) {
    return { state: 'error', message: errorMessage(error) }
  }
}
