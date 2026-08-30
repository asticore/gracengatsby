/**
 * Access control for the three database routes, and the D1 handle they use.
 *
 * Both checks, not either: `hasInternalRouteKey` proves the caller is the
 * operator's own tooling rather than something that found the URL, and the
 * admin session proves a real person with admin rights is behind it. The other
 * internal routes settle for one or the other because none of them can destroy
 * anything. Dropping tables can, so it gets both.
 *
 * A failure returns 404, not 403, for the same reason the other internal
 * routes do: an endpoint that admits it exists is an endpoint worth attacking.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

import { getEngine } from '@/lib/engine'
import { hasInternalRouteKey } from '@/utilities/internalRouteGuard'

import { cleanupDbFromD1, type CleanupDb } from './db'

/** True when the request carries the internal key AND an admin's session. */
export async function isAuthorisedDatabaseRequest(request: Request): Promise<boolean> {
  if (!hasInternalRouteKey(request)) return false
  return await hasAdminSession(request.headers)
}

/** The session half on its own, for the admin screen's own server actions. */
export async function hasAdminSession(headers: Headers): Promise<boolean> {
  try {
    const engine = await getEngine()
    const { user } = await engine.auth({ headers })
    return Boolean((user as { roles?: string[] } | null)?.roles?.includes('admin'))
  } catch {
    return false
  }
}

/** The D1 binding wrapped in the primitives this feature works through. */
export async function getCleanupDb(): Promise<CleanupDb | null> {
  try {
    const { env } = await getCloudflareContext({ async: true })
    const db = (env as { D1?: unknown }).D1
    if (!db) return null
    return cleanupDbFromD1(db as Parameters<typeof cleanupDbFromD1>[0])
  } catch {
    return null
  }
}
