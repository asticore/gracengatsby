import { resolveD1Binding } from '@/cms/db/connect'

import { createSharedRateLimiter, type RateLimitStore } from './sharedRateLimit'

/**
 * The D1 side of shared rate limiting: the `eg_rate_limits` table behind
 * sharedRateLimit.ts. Server-only, so nothing the request middleware loads may
 * import it. Writes are one atomic upsert: a closed window is restarted in the
 * same statement that counts the hit, so two isolates racing on one key cannot
 * both read a stale count.
 */

export const RATE_LIMITS_TABLE = 'eg_rate_limits'

const T = `\`${RATE_LIMITS_TABLE}\``

// ?1 key, ?2 now, ?3 expires_at for a fresh window.
const INCREMENT_SQL = `INSERT INTO ${T} (\`key\`, \`count\`, \`window_start\`, \`expires_at\`)
  VALUES (?1, 1, ?2, ?3)
  ON CONFLICT(\`key\`) DO UPDATE SET
    \`count\` = CASE WHEN ${T}.\`expires_at\` > ?2 THEN ${T}.\`count\` + 1 ELSE 1 END,
    \`window_start\` = CASE WHEN ${T}.\`expires_at\` > ?2 THEN ${T}.\`window_start\` ELSE ?2 END,
    \`expires_at\` = CASE WHEN ${T}.\`expires_at\` > ?2 THEN ${T}.\`expires_at\` ELSE ?3 END
  RETURNING \`count\`, \`window_start\`, \`expires_at\``

type Raw = { count: number; window_start: number; expires_at: number }

export const createD1RateLimitStore = (getD1: () => Promise<D1Database>): RateLimitStore => ({
  async increment(key, windowMs, now) {
    const d1 = await getD1()
    const row = await d1.prepare(INCREMENT_SQL).bind(key, now, now + windowMs).first<Raw>()
    if (!row) throw new Error('rate limit upsert returned no row')
    return { count: Number(row.count), windowStart: Number(row.window_start), expiresAt: Number(row.expires_at) }
  },

  async prune(now) {
    const d1 = await getD1()
    await d1.prepare(`DELETE FROM ${T} WHERE \`expires_at\` <= ?1`).bind(now).run()
  },
})

export const d1RateLimitStore: RateLimitStore = createD1RateLimitStore(resolveD1Binding)

/**
 * The limiter the account and two-factor guessing limits call. One instance per
 * isolate, so the prune interval is per isolate, as the note above says.
 */
export const hitShared = createSharedRateLimiter(d1RateLimitStore)
