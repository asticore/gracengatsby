/**
 * Loads every page of a paged list endpoint, such as /api/pages?limit=1000&depth=0.
 * Pure: the caller supplies the JSON fetch, so this runs in tests without a network.
 */

/** Fetches one URL and returns the parsed JSON body. Throws when the request failed. */
export type JsonFetcher = (url: string) => Promise<unknown>

type PageEnvelope = { docs?: unknown; hasNextPage?: unknown }

export const DEFAULT_MAX_PAGES = 50

/** The first page keeps the base URL unchanged; later pages add `page=N`. */
export function pageUrl(baseUrl: string, page: number): string {
  if (page <= 1) return baseUrl
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`
}

/**
 * Walks the pages until the server says there is no next page. When the response has no
 * `hasNextPage` flag, a short page (fewer docs than `limit`) ends the walk. A bare array
 * response is treated as one complete page. Throws if any page fails, so the caller can
 * keep whatever list it already has.
 */
export async function fetchAllPages(
  fetchJson: JsonFetcher,
  baseUrl: string,
  limit: number,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<unknown[]> {
  const all: unknown[] = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchJson(pageUrl(baseUrl, page))
    if (data === null || data === undefined) throw new Error('Failed to fetch pages')
    if (Array.isArray(data)) {
      all.push(...data)
      break
    }
    const envelope = (typeof data === 'object' ? data : {}) as PageEnvelope
    const docs = Array.isArray(envelope.docs) ? envelope.docs : []
    all.push(...docs)
    const hasMore = typeof envelope.hasNextPage === 'boolean' ? envelope.hasNextPage : docs.length >= limit
    if (!hasMore || docs.length === 0) break
  }
  return all
}
