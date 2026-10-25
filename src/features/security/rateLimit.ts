import { purgeExpiredWindows, incrementWindow, readWindow, resolveRateLimitD1, type RateLimitD1 } from './rateLimitStore'
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
 * Sign-in, reset, register, content-unlock and the login route class no longer rely on
 * this alone: they count in D1 through `hitShared` (rateLimitStore.ts) and use this
 * map only as the fallback when D1 is unavailable. The general API and form limits
 * below still use `hit` directly.
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

export function hit(key: string, limit: number, now = Date.now(), windowMs = WINDOW_MS): RateLimitDecision {
  sweep(now)

  const existing = buckets.get(key)
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs }

  bucket.count += 1
  buckets.set(key, bucket)

  return {
    limited: bucket.count > limit,
    count: bucket.count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

/** The in-memory count for a key in its live window, without counting. */
export function peek(key: string, now = Date.now()): number {
  const existing = buckets.get(key)
  return existing && existing.resetAt > now ? existing.count : 0
}

export type SharedOptions = {
  windowMs?: number
  now?: number
  /** Tests pass a D1 binding directly; production resolves it from the Cloudflare context. */
  d1?: RateLimitD1 | null
  /** Share of writes that also purge ended windows. */
  purgeChance?: number
}

const PURGE_CHANCE = 0.02

/**
 * `hit`, but counted in D1 (fixed window) so the limit holds across isolates.
 * Falls back to the in-memory counter, with the same limit, when D1 is not there
 * or the write fails: a limiter must not be able to take sign-in down with it.
 */
export async function hitShared(key: string, limit: number, options: SharedOptions = {}): Promise<RateLimitDecision> {
  const now = options.now ?? Date.now()
  const windowMs = options.windowMs ?? WINDOW_MS
  try {
    const d1 = options.d1 === undefined ? await resolveRateLimitD1() : options.d1
    if (!d1) return hit(key, limit, now, windowMs)
    const { count, retryAfterSeconds } = await incrementWindow(d1, key, windowMs, now)
    if (Math.random() < (options.purgeChance ?? PURGE_CHANCE)) {
      await purgeExpiredWindows(d1, now).catch((): undefined => undefined)
    }
    return { limited: count > limit, count, limit, retryAfterSeconds }
  } catch {
    return hit(key, limit, now, windowMs)
  }
}

/** The shared count for a key in its live window, without counting. Memory when D1 is unavailable. */
export async function peekShared(key: string, options: Pick<SharedOptions, 'windowMs' | 'now' | 'd1'> = {}): Promise<number> {
  const now = options.now ?? Date.now()
  try {
    const d1 = options.d1 === undefined ? await resolveRateLimitD1() : options.d1
    if (!d1) return peek(key, now)
    return await readWindow(d1, key, options.windowMs ?? WINDOW_MS, now)
  } catch {
    return peek(key, now)
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
  // The other headers are client-controlled, so they only count outside production.
  const dev = process.env.NODE_ENV !== 'production'
  const ip =
    headers.get('cf-connecting-ip') ||
    (dev && (headers.get('x-real-ip') || headers.get('x-forwarded-for')?.split(',')[0]?.trim())) ||
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
