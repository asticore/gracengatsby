/**
 * Fixed-window counters in D1 (`eg_rate_limits`), so a limit holds across every
 * isolate instead of per isolate. One row per key and window; the window start is the
 * current time rounded down to the window length, so every isolate computes the same
 * row without coordinating.
 *
 * Server-only, bound statements only. The D1 binding is resolved the way the audit
 * log does it (the Cloudflare context), which is safe from request middleware. Callers
 * go through `hitShared` in rateLimit.ts, which falls back to memory when anything
 * here throws.
 */

export const RATE_LIMIT_TABLE = 'eg_rate_limits'

export type RateLimitD1 = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => { all: () => Promise<{ results?: unknown[] }>; run: () => Promise<unknown> }
  }
}

export async function resolveRateLimitD1(): Promise<RateLimitD1 | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return (context?.env?.D1 as unknown as RateLimitD1) ?? null
  } catch {
    return null
  }
}

export const windowStartOf = (now: number, windowMs: number): number => Math.floor(now / windowMs) * windowMs

/** Adds one to the key's current window and returns the new count. */
export async function incrementWindow(d1: RateLimitD1, key: string, windowMs: number, now: number): Promise<{ count: number; retryAfterSeconds: number }> {
  const start = windowStartOf(now, windowMs)
  const end = start + windowMs
  const { results } = await d1
    .prepare(
      `INSERT INTO ${RATE_LIMIT_TABLE} (key, window_start, count, expires_at) VALUES (?, ?, 1, ?) ` +
        'ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1 RETURNING count',
    )
    .bind(key, start, end)
    .all()
  const count = Number((results?.[0] as { count?: unknown } | undefined)?.count)
  if (!Number.isFinite(count)) throw new Error('rate limit counter returned no count')
  return { count, retryAfterSeconds: Math.max(1, Math.ceil((end - now) / 1000)) }
}

/** The key's count in the current window, without counting anything. */
export async function readWindow(d1: RateLimitD1, key: string, windowMs: number, now: number): Promise<number> {
  const { results } = await d1
    .prepare(`SELECT count FROM ${RATE_LIMIT_TABLE} WHERE key = ? AND window_start = ?`)
    .bind(key, windowStartOf(now, windowMs))
    .all()
  const count = Number((results?.[0] as { count?: unknown } | undefined)?.count)
  return Number.isFinite(count) ? count : 0
}

/** Drops windows that have ended. Cheap, and called on a small share of writes. */
export async function purgeExpiredWindows(d1: RateLimitD1, now: number): Promise<void> {
  await d1.prepare(`DELETE FROM ${RATE_LIMIT_TABLE} WHERE expires_at < ?`).bind(now).run()
}
