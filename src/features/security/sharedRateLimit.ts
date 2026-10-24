import { hit, type RateLimitDecision } from './rateLimit'

/**
 * Shared-state rate limiting for the account and two-factor guessing limits.
 *
 * `rateLimit.ts` counts per Workers isolate, which multiplies a client's
 * allowance by the number of isolates it lands on. This module counts in D1
 * (`eg_rate_limits`) so every isolate sees the same window.
 *
 * Failure policy: FAIL OPEN. If the store throws, the request is decided by the
 * per-isolate counter instead and a warning is logged. A database outage must
 * never block sign-in; the per-isolate counter still stops a single isolate
 * being hammered.
 *
 * This file is pure: the store is passed in, so tests can use an in-memory one.
 * The D1 store and the default limiter live in rateLimitStore.ts.
 */

export const SHARED_WINDOW_MS = 60_000

/** Expired rows are deleted at most this often per isolate. */
export const PRUNE_INTERVAL_MS = 5 * 60_000

export type RateLimitCounter = {
  count: number
  windowStart: number
  expiresAt: number
}

export type RateLimitStore = {
  /**
   * Counts one hit for `key`. If the stored window has closed (or none exists)
   * a fresh window starts at `now`. Must be atomic: concurrent calls must each
   * see their own increment.
   */
  increment: (key: string, windowMs: number, now: number) => Promise<RateLimitCounter>
  /** Deletes rows whose window closed at or before `now`. */
  prune: (now: number) => Promise<void>
}

export type SharedLimiter = (key: string, limit: number, now?: number) => Promise<RateLimitDecision>

export type SharedLimiterOptions = {
  windowMs?: number
  pruneEveryMs?: number
  /** Used when the store throws. Defaults to the per-isolate `hit`. */
  fallback?: (key: string, limit: number, now?: number) => RateLimitDecision
  warn?: (message: string, detail: unknown) => void
}

const defaultWarn = (message: string, detail: unknown): void => {
  console.warn(message, detail)
}

export function createSharedRateLimiter(store: RateLimitStore, options: SharedLimiterOptions = {}): SharedLimiter {
  const windowMs = options.windowMs ?? SHARED_WINDOW_MS
  const pruneEveryMs = options.pruneEveryMs ?? PRUNE_INTERVAL_MS
  const fallback = options.fallback ?? ((key, limit, now) => hit(key, limit, now))
  const warn = options.warn ?? defaultWarn
  let lastPrunedAt: number | null = null

  const maybePrune = (now: number): void => {
    if (lastPrunedAt !== null && now - lastPrunedAt < pruneEveryMs) return
    lastPrunedAt = now
    Promise.resolve()
      .then(() => store.prune(now))
      .catch((err: unknown) => warn('[rate-limit] could not prune expired rows', err))
  }

  return async (key, limit, now = Date.now()) => {
    maybePrune(now)
    try {
      const counter = await store.increment(key, windowMs, now)
      return {
        limited: counter.count > limit,
        count: counter.count,
        limit,
        retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt - now) / 1000)),
      }
    } catch (err) {
      warn('[rate-limit] shared store unavailable; falling back to the per-isolate counter', err)
      return fallback(key, limit, now)
    }
  }
}
