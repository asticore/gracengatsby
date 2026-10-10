/**
 * Fontsource catalog access for the admin font search. Server-side only: the
 * list is fetched once per isolate and kept in module memory for an hour, so
 * typing in the search box never fans out to api.fontsource.org.
 */
import { sanitizeFamily, sanitizeFontId, sanitizeWeights } from './installed'
import type { CatalogFont } from './types'

export const CATALOG_URL = 'https://api.fontsource.org/v1/fonts'
export const CATALOG_TTL_MS = 60 * 60 * 1000
export const SEARCH_RESULT_LIMIT = 30
const FETCH_TIMEOUT_MS = 8000

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

let cache: { at: number; fonts: CatalogFont[] } | null = null
let inflight: Promise<CatalogFont[]> | null = null

const asStringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

/**
 * Turns the Fontsource list response into CatalogFont rows. The v1 API returns
 * an object keyed by id; an array is accepted too. Entries that cannot be
 * rendered safely (bad id or family) are dropped here, not at display time.
 */
export function normaliseCatalog(raw: unknown): CatalogFont[] {
  const entries: unknown[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : []
  const out: CatalogFont[] = []
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = sanitizeFontId(e.id)
    const family = sanitizeFamily(e.family)
    if (!id || !family) continue
    const font: CatalogFont = {
      id,
      family,
      weights: sanitizeWeights(e.weights),
      styles: asStringList(e.styles),
      subsets: asStringList(e.subsets),
      type: typeof e.type === 'string' ? e.type : 'other',
    }
    if (typeof e.category === 'string') font.category = e.category
    out.push(font)
  }
  return out
}

/** Returns the cached catalog, fetching it when stale. Failures are not cached. */
export async function loadCatalog(fetchImpl: FetchLike = fetch, now: number = Date.now()): Promise<CatalogFont[]> {
  if (cache && now - cache.at < CATALOG_TTL_MS) return cache.fonts
  if (inflight) return inflight
  inflight = (async () => {
    const response = await fetchImpl(CATALOG_URL, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Fontsource catalog responded ${response.status}`)
    const fonts = normaliseCatalog(await response.json())
    cache = { at: now, fonts }
    return fonts
  })()
  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export type CatalogSource = 'all' | 'google' | 'other'

/**
 * Case-insensitive substring match on the family name. An empty query returns
 * nothing: the full catalog is far too long to be a useful first screen.
 */
export function searchCatalog(fonts: readonly CatalogFont[], query: string, source: CatalogSource = 'all'): CatalogFont[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  const matches = fonts.filter((font) => {
    if (source === 'google' && font.type !== 'google') return false
    if (source === 'other' && font.type === 'google') return false
    return font.family.toLowerCase().includes(needle)
  })
  matches.sort((a, b) => {
    const aPrefix = a.family.toLowerCase().startsWith(needle) ? 0 : 1
    const bPrefix = b.family.toLowerCase().startsWith(needle) ? 0 : 1
    return aPrefix - bPrefix || a.family.localeCompare(b.family)
  })
  return matches.slice(0, SEARCH_RESULT_LIMIT)
}

/** Test seam: drops the in-memory cache. */
export function resetCatalogCache(): void {
  cache = null
  inflight = null
}
