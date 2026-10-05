/**
 * Redirect resolution and cache management.
 * Reads enabled redirects from D1, caches them, and resolves incoming requests.
 */

import { normalizePath, type RedirectType } from './validate'

type D1Database = any

export interface ResolvedRedirect {
  id: number
  to: string
  status: 301 | 302 | 307 | 308
}

interface CachedRedirects {
  at: number
  redirects: Map<string, ResolvedRedirect>
}

const CACHE_TTL_MS = 60_000 // 60 seconds

let cachedData: CachedRedirects | null = null

// For testing: allow injecting a custom D1 getter
const testGetters = { d1: null as (() => Promise<D1Database | null>) | null }

export function __setD1ForTests(getter: (() => Promise<D1Database | null>) | null): void {
  testGetters.d1 = getter
}

/**
 * Get D1 database instance
 */
async function getD1(): Promise<D1Database | null> {
  try {
    if (testGetters.d1) {
      return await testGetters.d1()
    }

    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.env?.D1 ?? null
  } catch {
    return null
  }
}

/**
 * Invalidate the cached redirects so the next request re-reads from D1
 */
export function invalidateRedirectsCache(): void {
  cachedData = null
}

/**
 * Record a redirect hit in the database
 */
export async function recordRedirectHit(id: number): Promise<void> {
  try {
    const db = await getD1()
    if (!db) return

    const now = new Date().toISOString()
    await db
      .prepare('UPDATE eg_redirects SET hit_count = COALESCE(hit_count, 0) + 1, last_hit = ? WHERE id = ?')
      .bind(now, id)
      .run()
  } catch {
    // Swallow errors - recording hits is best-effort
  }
}

/**
 * Load all enabled redirects from D1 into a Map keyed by normalized from_path
 */
async function loadRedirectsFromD1(): Promise<Map<string, ResolvedRedirect>> {
  const db = await getD1()

  if (!db) {
    return new Map()
  }

  try {
    const result = await db
      .prepare('SELECT id, from_path, to_path, redirect_type FROM eg_redirects WHERE enabled = 1')
      .all()

    const redirects = new Map<string, ResolvedRedirect>()

    if (result.results) {
      for (const row of result.results as Array<{
        id: number
        from_path: string
        to_path: string
        redirect_type: string
      }>) {
        const normalizedFrom = normalizePath(row.from_path)
        const status = parseInt(row.redirect_type) as 301 | 302 | 307 | 308

        redirects.set(normalizedFrom, {
          id: row.id,
          to: row.to_path,
          status,
        })
      }
    }

    return redirects
  } catch {
    // Missing table or any error returns empty map, don't throw
    return new Map()
  }
}

/**
 * Resolve a redirect for a given pathname
 * Returns the redirect details if found and enabled, null otherwise
 */
export async function resolveRedirect(pathname: string): Promise<ResolvedRedirect | null> {
  const now = Date.now()

  // Check cache validity
  if (cachedData && now - cachedData.at < CACHE_TTL_MS) {
    const normalized = normalizePath(pathname)
    return cachedData.redirects.get(normalized) ?? null
  }

  // Load from D1
  const redirects = await loadRedirectsFromD1()

  // Update cache
  cachedData = { at: now, redirects }

  // Look up the normalized pathname
  const normalized = normalizePath(pathname)
  return redirects.get(normalized) ?? null
}
