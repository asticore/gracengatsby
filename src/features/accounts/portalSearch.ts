/**
 * Pure helpers for the account search box. No DOM and no network: the screen
 * list is matched here, and site results come from /api/search-suggest.
 */

export type ScreenLink = { href: string; label: string }

export const PORTAL_SEARCH_MIN_CHARS = 2
export const PORTAL_SEARCH_MAX_QUERY = 80

/** Trims, collapses spaces and caps the length. Keeps the query the user typed otherwise. */
export function normaliseQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, PORTAL_SEARCH_MAX_QUERY).trim()
}

/** Account screens whose label contains the query (case-insensitive). Empty below the minimum length. */
export function matchScreens(links: ScreenLink[], raw: string): ScreenLink[] {
  const query = normaliseQuery(raw).toLowerCase()
  if (query.length < PORTAL_SEARCH_MIN_CHARS) return []
  return links.filter((link) => link.label.toLowerCase().includes(query))
}
