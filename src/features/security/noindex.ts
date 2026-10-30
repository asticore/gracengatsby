/**
 * Paths that must never be indexed or listed: the admin portal, the JSON API,
 * the login and auth screens, and the preview pages. Pure, so the edge
 * middleware, the robots builder and the sitemap can all share one definition.
 */

export const NOINDEX_HEADER_VALUE = 'noindex, nofollow, noarchive'

import { DEFAULT_ADMIN_PATH as DEFAULT_ADMIN_ROOT } from './adminPath'

/** Admin root used when no custom admin path is configured. */
export { DEFAULT_ADMIN_ROOT }

const NON_PUBLIC_PREFIXES = ['/api', '/login', '/preview']

const underPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

/**
 * True when the response for this path must carry X-Robots-Tag noindex and
 * must not appear in robots.txt allow rules or the sitemap.
 */
export function isNoindexPath(pathname: string, adminRoot: string = DEFAULT_ADMIN_ROOT): boolean {
  if (underPrefix(pathname, DEFAULT_ADMIN_ROOT) || underPrefix(pathname, adminRoot)) return true
  return NON_PUBLIC_PREFIXES.some((prefix) => underPrefix(pathname, prefix))
}

/** The visual event picker is marked with ?eg-event-picker=1. Such a response is never indexed, whatever the path. */
export const PICKER_QUERY = 'eg-event-picker'

export function isPickerRequest(url: { searchParams: URLSearchParams }): boolean {
  return url.searchParams.get(PICKER_QUERY) === '1'
}
