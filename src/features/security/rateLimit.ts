import type { SecuritySettings } from './settings'

/**
 * Request-per-minute limiting for API and form routes.
 *
 * READ THIS BEFORE TRUSTING THE NUMBER.
 *
 * The counter lives in the memory of one Workers isolate. Cloudflare runs many
 * isolates for one Worker - per colo, and several within a colo - and it
 * recycles them freely. So a limit of 120/minute is 120 per isolate, not 120
 * globally: a client spread across ten isolates gets ten times the allowance,
 * and a client whose isolate is recycled gets a fresh allowance immediately.
 * It stops a single client hammering a single isolate, which is the shape of
 * most casual abuse and form spam, and it costs nothing. It is not a defence
 * against a distributed flood.
 *
 * Making it global needs shared state, in order of preference:
 *   1. A Durable Object keyed by client identifier - exact counts, strongly
 *      consistent, one object per key. Add a `durable_objects` binding in
 *      wrangler.jsonc and replace `hit()` with a fetch to the stub.
 *   2. Cloudflare's own Rate Limiting binding - no code, no state to manage,
 *      but only fixed-period counting and configured outside this screen.
 *   3. KV - cheap and global but eventually consistent, so counts lag and the
 *      limit becomes advisory. Fine for logging, not for blocking.
 * Nothing else in this module changes when one of those lands: the interface
 * is `hit()` returning a decision.
 */

export type RateLimitDecision = {
  limited: boolean
  /** Requests already counted in the current window, including this one. */
  count: number
  limit: number
  /** Seconds until the window rolls over, for Retry-After. */
  retryAfterSeconds: number
}

type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 60_000

/**
 * Bounded so a scan across many forged client identifiers cannot grow the map
 * until the isolate runs out of memory - which would be a denial of service
 * caused by the thing meant to prevent one.
 */
const MAX_TRACKED_KEYS = 10_000

const buckets = new Map<string, Bucket>()

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size <= MAX_TRACKED_KEYS) return

  // Still over after dropping the expired ones: forget the oldest entries.
  // Insertion order is close enough to age order for this purpose.
  const excess = buckets.size - MAX_TRACKED_KEYS
  let removed = 0
  for (const key of buckets.keys()) {
    buckets.delete(key)
    if (++removed >= excess) break
  }
}

export function hit(key: string, limit: number, now = Date.now()): RateLimitDecision {
  sweep(now)

  const existing = buckets.get(key)
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + WINDOW_MS }

  bucket.count += 1
  buckets.set(key, bucket)

  return {
    limited: bucket.count > limit,
    count: bucket.count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

/** Empties the counters. Exists for tests; nothing in the request path calls it. */
export function resetRateLimiter(): void {
  buckets.clear()
}

/**
 * The client identifier.
 *
 * CF-Connecting-IP is set by the edge and cannot be forged by the client, so
 * it is preferred over X-Forwarded-For, which can be. Requests arriving with
 * neither share one bucket rather than each getting their own - being
 * unidentifiable should not be an advantage.
 */
export function clientKey(request: Request): string {
  const headers = request.headers
  const ip =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'

  return ip
}

export type RouteClass = 'api' | 'form' | 'login' | 'none'

/**
 * Which limit, if any, a path falls under.
 *
 * Login is separated out because it is rate-limited on a much tighter budget
 * than ordinary API traffic - see `loginProtection` - and because it must stay
 * limited even when the API limit is switched off.
 */
export function classifyRoute(pathname: string, method: string): RouteClass {
  if (pathname === '/api/users/login' || pathname.endsWith('/api/users/login')) return 'login'
  if (pathname.startsWith('/api/')) return 'api'

  // Anything posted to a public page is treated as a form submission: RSVP,
  // checkout, newsletter. They share the form budget rather than the API one.
  if (method === 'POST') return 'form'

  return 'none'
}

/** The limit that applies to a route class, or null when it is not limited. */
export function limitFor(settings: SecuritySettings, route: RouteClass): number | null {
  if (!settings.featureEnabled || !settings.rateLimiting.enabled) return null

  switch (route) {
    case 'api':
      return settings.rateLimiting.applyToApi ? settings.rateLimiting.requestsPerMinute : null
    case 'form':
      return settings.rateLimiting.applyToForms ? settings.rateLimiting.requestsPerMinute : null
    case 'login':
      // Guessing passwords needs volume; ordinary people need a handful of
      // tries. The per-account lockout in loginProtection.ts is the real
      // control - this only stops one address spraying many accounts, which a
      // per-account counter by definition cannot see.
      return Math.max(5, settings.loginProtection.maxLoginAttempts * 2)
    default:
      return null
  }
}
