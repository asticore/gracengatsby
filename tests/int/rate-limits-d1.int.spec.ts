// @vitest-environment node
// Shared rate limits over the real eg_rate_limits table (wrangler's D1 proxy,
// not persisted), plus the fail-open path. The in-memory limiter is what the
// fallback uses, so it is exercised by the outage case.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import { drizzle } from 'drizzle-orm/d1'

import { consoleLogger } from '@/localapi/logger'
import * as rateLimitMigration from '@/migrations/20261121_100000_rate_limits'
import { createD1RateLimitStore } from '@/features/security/rateLimitStore'
import { hit, resetRateLimiter } from '@/features/security/rateLimit'
import { createSharedRateLimiter, type RateLimitStore } from '@/features/security/sharedRateLimit'

const WINDOW = 60_000
let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
let store: RateLimitStore
let prefix = ''

// Keys are unique per test so nothing leaks between cases.
const key = (name: string) => `${prefix}:${name}`

beforeAll(async () => {
  proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
  const db = drizzle(proxy.env.D1) as never
  await rateLimitMigration.up({ db, engine: { logger: consoleLogger } } as never)
  store = createD1RateLimitStore(async () => proxy.env.D1)
  prefix = `t${Date.now()}`
}, 300_000)

afterAll(async () => {
  await proxy.dispose()
})

beforeEach(() => {
  resetRateLimiter()
})

const quietWarn = () => vi.fn()

describe('shared rate limits over eg_rate_limits', () => {
  it('counts hits in a window and limits once the count passes the limit', async () => {
    const limiter = createSharedRateLimiter(store, { warn: quietWarn() })
    const t0 = 1_000_000
    const results = []
    for (let i = 0; i < 4; i++) results.push(await limiter(key('window'), 3, t0 + i))
    expect(results.map((r) => r.count)).toEqual([1, 2, 3, 4])
    expect(results.map((r) => r.limited)).toEqual([false, false, false, true])
    expect(results[3].limit).toBe(3)
    expect(results[3].retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('restarts the count once the window has closed', async () => {
    const limiter = createSharedRateLimiter(store, { warn: quietWarn() })
    const t0 = 2_000_000
    await limiter(key('reset'), 1, t0)
    const blocked = await limiter(key('reset'), 1, t0 + 1)
    expect(blocked.limited).toBe(true)
    const later = await limiter(key('reset'), 1, t0 + WINDOW)
    expect(later.count).toBe(1)
    expect(later.limited).toBe(false)
  })

  it('keeps each key in its own count', async () => {
    const limiter = createSharedRateLimiter(store, { warn: quietWarn() })
    const t0 = 3_000_000
    await limiter(key('iso-a'), 1, t0)
    await limiter(key('iso-a'), 1, t0)
    const other = await limiter(key('iso-b'), 1, t0)
    expect(other.count).toBe(1)
    expect(other.limited).toBe(false)
  })

  it('shares one count between two limiter instances over the same store', async () => {
    const first = createSharedRateLimiter(store, { warn: quietWarn() })
    const second = createSharedRateLimiter(store, { warn: quietWarn() })
    const t0 = 4_000_000
    await first(key('shared'), 2, t0)
    const fromSecond = await second(key('shared'), 2, t0 + 1)
    expect(fromSecond.count).toBe(2)
    const third = await first(key('shared'), 2, t0 + 2)
    expect(third.limited).toBe(true)
  })

  it('counts concurrent hits atomically', async () => {
    const limiter = createSharedRateLimiter(store, { warn: quietWarn() })
    const t0 = 5_000_000
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter(key('race'), 5, t0)))
    expect(results.map((r) => r.count).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(results.filter((r) => r.limited)).toHaveLength(5)
  })

  it('fails open to the per-isolate counter when the store throws, and warns', async () => {
    const warn = quietWarn()
    const broken: RateLimitStore = {
      increment: async () => {
        throw new Error('D1 unavailable')
      },
      prune: async () => undefined,
    }
    const limiter = createSharedRateLimiter(broken, { warn })
    const first = await limiter(key('outage'), 2, 6_000_000)
    expect(first.limited).toBe(false)
    expect(first.count).toBe(1)
    const second = await limiter(key('outage'), 2, 6_000_000)
    const third = await limiter(key('outage'), 2, 6_000_000)
    expect(second.limited).toBe(false)
    expect(third.limited).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('uses the injected fallback when the store throws', async () => {
    const broken: RateLimitStore = {
      increment: async () => {
        throw new Error('D1 unavailable')
      },
      prune: async () => undefined,
    }
    const fallback = vi.fn(() => ({ limited: false, count: 7, limit: 9, retryAfterSeconds: 1 }))
    const limiter = createSharedRateLimiter(broken, { warn: quietWarn(), fallback })
    const decision = await limiter(key('fb'), 9, 1)
    expect(fallback).toHaveBeenCalledWith(key('fb'), 9, 1)
    expect(decision.count).toBe(7)
  })

  it('prunes expired rows at most once per prune interval', async () => {
    const pruned: number[] = []
    const spy: RateLimitStore = {
      increment: (k, windowMs, now) => store.increment(k, windowMs, now),
      prune: async (now) => {
        pruned.push(now)
      },
    }
    const limiter = createSharedRateLimiter(spy, { warn: quietWarn(), pruneEveryMs: 1_000 })
    await limiter(key('prune-a'), 5, 10_000)
    await limiter(key('prune-a'), 5, 10_500)
    await limiter(key('prune-a'), 5, 11_500)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(pruned).toEqual([10_000, 11_500])
  })

  it('deletes expired rows from D1 when pruned and leaves live ones', async () => {
    const live = key('prune-live')
    const dead = key('prune-dead')
    await store.increment(dead, WINDOW, 100)
    await store.increment(live, WINDOW, 100)
    const future = 100 + WINDOW + 1
    await store.increment(live, WINDOW, future)
    await store.prune(100 + WINDOW)
    const rows = (await proxy.env.D1.prepare('SELECT `key` AS k FROM `eg_rate_limits` WHERE `key` IN (?, ?)').bind(live, dead).all()).results as { k: string }[]
    expect(rows.map((r) => r.k)).toEqual([live])
  })

  it('leaves the per-isolate limiter used by the other endpoints untouched', () => {
    const decision = hit(key('isolate-only'), 1)
    expect(decision.count).toBe(1)
  })
})
