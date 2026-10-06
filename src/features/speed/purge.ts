import { revalidatePath } from 'next/cache'

import { getSpeedSettings } from './settings'

const SITE_URL = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/$/, '')

export type PurgeResult = {
  /** False when the feature or "clear saved copies on publish" is off - nothing was attempted. */
  ran: boolean
  paths: string[]
  /** Paths whose edge copy was found and dropped. */
  edgeEvicted: string[]
  /** Paths handed to the framework's own revalidation. */
  revalidated: string[]
  errors: string[]
}

/**
 * WHAT A PURGE CAN AND CANNOT DO ON THIS STACK
 *
 * There are two separate caches in play and only one of them is fully ours:
 *
 * 1. The Worker's own edge cache (`caches.default`). We put entries there
 *    ourselves in withPageCache(), so we can delete them precisely.
 *    `caches.default.delete(url)` only clears the cache of the *colo that is
 *    executing this request*. Cloudflare's edge is hundreds of independent
 *    colos - a purge run in Sydney does not touch the copy sitting in Frankfurt.
 *    Those copies expire on their own TTL instead. Buying an editor a
 *    guaranteed global purge means calling Cloudflare's zone purge REST API
 *    with an API token, which this install has no credentials for; if that is
 *    ever wanted, this is the single function to add it to.
 *
 * 2. The framework's route cache, cleared with revalidatePath(). This is
 *    per-isolate/per-deployment rather than global for the same reason. It is
 *    still worth calling: it is what makes the edit visible to the editor who
 *    just made it, which is the complaint that actually gets raised.
 *
 * 3. The visitor's *browser* cache cannot be purged by anyone, ever. This is
 *    why applySpeedHeaders sets `max-age=0, s-maxage=<ttl>` for public pages -
 *    the shared cache holds the copy (purgeable), the browser does not
 *    (not purgeable).
 *
 * So: an editor publishing a change sees it immediately, most visitors see it
 * quickly, and the worst case is one TTL of staleness in a distant region.
 * That is the honest promise to put in front of the "clear saved copies" toggle.
 */
export async function purgeCache(paths: string[] | string): Promise<PurgeResult> {
  const list = Array.from(
    new Set((Array.isArray(paths) ? paths : [paths]).map((p) => (p.startsWith('/') ? p : `/${p}`)).filter(Boolean)),
  )

  const result: PurgeResult = { ran: false, paths: list, edgeEvicted: [], revalidated: [], errors: [] }
  if (!list.length) return result

  const speed = await getSpeedSettings()
  if (!speed.enabled || !speed.caching.purgeOnPublish) return result
  result.ran = true

  const edge = await openEdgeCache()

  for (const path of list) {
    if (edge) {
      try {
        // Both spellings get stored depending on how the request arrived.
        const withSlash = path.endsWith('/') ? path : `${path}/`
        const hits = await Promise.all(
          Array.from(new Set([path, withSlash])).map((variant) => edge.delete(`${SITE_URL}${variant}`)),
        )
        if (hits.some(Boolean)) result.edgeEvicted.push(path)
      } catch (error) {
        result.errors.push(`edge ${path}: ${String(error)}`)
      }
    }

    try {
      revalidatePath(path)
      result.revalidated.push(path)
    } catch (error) {
      // revalidatePath throws outside a request/action scope. A hook calling
      // this from a background context should still get its edge eviction.
      result.errors.push(`revalidate ${path}: ${String(error)}`)
    }
  }

  // Cloudflare zone cache (only when a zone and token are saved in Integrations
  // and "purge on publish" is on there). Best effort, never throws.
  const cloudflare = await purgeCloudflareByUrls(
    list.flatMap((path) => Array.from(new Set([`${SITE_URL}${path}`, `${SITE_URL}${path.endsWith('/') ? path : `${path}/`}`]))),
    { onPublish: true },
  )
  result.errors.push(...cloudflare.errors)

  return result
}

type EdgeCache = { match: (key: string) => Promise<Response | undefined>; put: (key: string, res: Response) => Promise<void>; delete: (key: string) => Promise<boolean> }

/**
 * `caches.default` exists only inside the Workers runtime. During a local Node
 * build, or in any non-Workers context, this returns null and every caller
 * degrades to "no edge cache" rather than crashing the request.
 */
export async function openEdgeCache(): Promise<EdgeCache | null> {
  try {
    const store = (globalThis as { caches?: { default?: unknown } }).caches?.default
    if (!store) return null
    return store as EdgeCache
  } catch {
    return null
  }
}

export type CloudflareResult = {
  ran: boolean
  errors: string[]
}

/**
 * Purge all cached pages from Cloudflare. Requires integrations.cloudflare.zoneId
 * and integrations.cloudflare.apiToken to be set. Best effort - never throws.
 */
export async function purgeCloudflareCache(): Promise<CloudflareResult> {
  const result: CloudflareResult = { ran: false, errors: [] }

  try {
    const { getEngine } = await import('@/lib/engine')
    const engine = await getEngine()

    const integrations = (await engine.findGlobal({
      slug: 'integrations',
      depth: 0,
      overrideAccess: true,
    }).catch((): null => null)) as any | null

    if (!integrations?.cloudflare?.zoneId || !integrations?.cloudflare?.apiToken) {
      return result
    }

    const { zoneId, apiToken } = integrations.cloudflare as { zoneId: string; apiToken: string }

    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ purge_everything: true }),
    })

    if (!response.ok) {
      const error = await response.text()
      result.errors.push(`Cloudflare API: ${response.status} ${error}`)
      return result
    }

    result.ran = true
  } catch (error) {
    result.errors.push(`Cloudflare purge: ${String(error)}`)
  }

  return result
}

/**
 * Batch Cloudflare cache purges by file URL (max 30 per request). Best effort - never throws.
 */
export async function purgeCloudflareByUrls(urls: string[], options: { onPublish?: boolean } = {}): Promise<CloudflareResult> {
  const result: CloudflareResult = { ran: false, errors: [] }

  if (urls.length === 0) return result

  try {
    const { getEngine } = await import('@/lib/engine')
    const engine = await getEngine()

    const integrations = (await engine.findGlobal({
      slug: 'integrations',
      depth: 0,
      overrideAccess: true,
    }).catch((): null => null)) as any | null

    if (!integrations?.cloudflare?.zoneId || !integrations?.cloudflare?.apiToken) {
      return result
    }
    if (options.onPublish && integrations.cloudflare.purgeOnPublish === false) {
      return result
    }

    const { zoneId, apiToken } = integrations.cloudflare as { zoneId: string; apiToken: string }

    // Batch into groups of 30
    for (let i = 0; i < urls.length; i += 30) {
      const batch = urls.slice(i, i + 30)
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ files: batch }),
      })

      if (!response.ok) {
        const error = await response.text()
        result.errors.push(`Cloudflare API batch: ${response.status} ${error}`)
      }
    }

    result.ran = true
  } catch (error) {
    result.errors.push(`Cloudflare batch purge: ${String(error)}`)
  }

  return result
}
