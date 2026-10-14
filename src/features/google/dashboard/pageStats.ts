import { checkConnection, searchSiteOrNull, type EngineArg } from './connection'
import { fetchPageSearch, NOT_SET_UP } from './searchConsole'
import { liveRequester, type GoogleRequester } from './requester'
import { errorMessage } from './shapeUtil'
import type { PageStatsResult } from './types'
import { resolveDocTarget } from '@/features/pagespeed/service'
import type { PageSpeedCollection } from '@/features/pagespeed/types'

/**
 * Search numbers for one document, for the card on its edit screen. The address comes from the same
 * server-side resolver PageSpeed uses (site origin plus the document's own slug), never from the browser.
 * Unpublished documents have no public address, so they get an honest message instead.
 */

type Resolver = typeof resolveDocTarget

export async function loadPageStats(
  engine: EngineArg,
  input: { collection: PageSpeedCollection; id: number },
  today: Date = new Date(),
  req: GoogleRequester = liveRequester,
  resolve: Resolver = resolveDocTarget,
): Promise<PageStatsResult> {
  const check = await checkConnection(engine)
  if (!check.connected) return { state: 'not-connected' }
  const site = searchSiteOrNull(check.info.searchConsoleSite)
  if (!site) return { state: 'not-set-up', message: NOT_SET_UP }

  const resolved = await resolve(engine as unknown as Parameters<Resolver>[0], input.collection, input.id)
  if (!resolved.found) return { state: 'unpublished', message: 'This page could not be found.' }
  if (resolved.target.ok === false) return { state: 'unpublished', message: resolved.target.reason }

  try {
    const data = await fetchPageSearch(engine, site, resolved.target.url, today, req)
    return { state: 'ok', data }
  } catch (error) {
    return { state: 'error', message: errorMessage(error) }
  }
}
