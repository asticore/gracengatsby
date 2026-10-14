// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadEdgeSettings,
  type D1Like,
  resetEdgeSettingsMemo,
  storedCopy,
  toEdgeSettings,
  withEdgeCache,
} from '@/features/speed/edgeCacheWorker'

const BASE = 'https://example.com'

const LIVE_ROW = {
  pageCache: 1,
  ttl: 900,
  epoch: 5,
  paths: '/landing*',
  cookies: 'wordpress_logged_in',
  queries: '',
  mobile: 0,
  loggedIn: 0,
  speedOn: 1,
}

/** Fake D1 that answers the settings query with one row (or throws when `fail` is set). */
const fakeDb = (row: Record<string, unknown> | null, fail = false): D1Like => ({
  prepare: () => ({
    first: async <T>(): Promise<T | null> => {
      if (fail) throw new Error('no such table')
      return row as T | null
    },
  }),
})

const htmlResponse = (body = '<html>page</html>', extra: Record<string, string> = {}): Response =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...extra } })

type FakeCache = {
  match: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

const installCache = (): FakeCache => {
  const cache: FakeCache = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  }
  ;(globalThis as { caches?: unknown }).caches = { default: cache }
  return cache
}

const ctx = () => ({ waitUntil: vi.fn() })

const liveEnv = (row: Record<string, unknown> | null = LIVE_ROW, fail = false) => ({ D1: fakeDb(row, fail) })

describe('toEdgeSettings', () => {
  it('returns null when there is no row', () => {
    expect(toEdgeSettings(null)).toBeNull()
  })

  it('is enabled only when the feature flag and page caching are both on', () => {
    expect(toEdgeSettings({ ...LIVE_ROW, speedOn: 0 })?.enabled).toBe(false)
    expect(toEdgeSettings({ ...LIVE_ROW, pageCache: 0 })?.enabled).toBe(false)
    expect(toEdgeSettings({ ...LIVE_ROW, speedOn: null })?.enabled).toBe(false)
    expect(toEdgeSettings(LIVE_ROW)?.enabled).toBe(true)
  })

  it('defaults a missing epoch to 1 and a missing TTL to 600', () => {
    const settings = toEdgeSettings({ ...LIVE_ROW, epoch: null, ttl: null })
    expect(settings?.epoch).toBe(1)
    expect(settings?.ttlSeconds).toBe(600)
  })

  it('parses the three rule boxes and lowercases query names', () => {
    const settings = toEdgeSettings({ ...LIVE_ROW, queries: '# comment\nS\nq' })
    expect(settings?.neverCachePaths).toEqual(['/landing*'])
    expect(settings?.neverCacheCookies).toEqual(['wordpress_logged_in'])
    expect(settings?.neverCacheQueryStrings).toEqual(['s', 'q'])
  })

  it('reads the mobile and logged-in switches', () => {
    const settings = toEdgeSettings({ ...LIVE_ROW, mobile: 1, loggedIn: true })
    expect(settings?.mobileSeparately).toBe(true)
    expect(settings?.cacheLoggedInUsers).toBe(true)
  })
})

describe('loadEdgeSettings', () => {
  beforeEach(() => resetEdgeSettingsMemo())

  it('returns null without a D1 binding', async () => {
    expect(await loadEdgeSettings(undefined)).toBeNull()
  })

  it('treats a failed read as off', async () => {
    expect(await loadEdgeSettings(fakeDb(null, true))).toBeNull()
  })

  it('memoises the read for the next request', async () => {
    const prepare = vi.fn(() => ({ first: async <T>(): Promise<T | null> => LIVE_ROW as T }))
    await loadEdgeSettings({ prepare })
    await loadEdgeSettings({ prepare })
    expect(prepare).toHaveBeenCalledTimes(1)
  })
})

describe('withEdgeCache', () => {
  let cache: FakeCache

  beforeEach(() => {
    resetEdgeSettingsMemo()
    cache = installCache()
  })

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches
  })

  it('calls the handler untouched when the feature is off', async () => {
    const handler = vi.fn(async () => htmlResponse())
    const response = await withEdgeCache(new Request(`${BASE}/about`), liveEnv({ ...LIVE_ROW, speedOn: 0 }), ctx(), handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-edge-cache')).toBeNull()
    expect(cache.match).not.toHaveBeenCalled()
  })

  it('calls the handler untouched when there is no D1 binding', async () => {
    const handler = vi.fn(async () => htmlResponse())
    await withEdgeCache(new Request(`${BASE}/about`), {}, ctx(), handler)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('stores a cacheable page and marks it MISS, calling the handler exactly once', async () => {
    const handler = vi.fn(async () => htmlResponse('<p>hi</p>'))
    const work = ctx()
    const response = await withEdgeCache(new Request(`${BASE}/about`), liveEnv(), work, handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-edge-cache')).toBe('MISS')
    expect(await response.text()).toBe('<p>hi</p>')
    expect(work.waitUntil).toHaveBeenCalledTimes(1)
    expect(cache.put).toHaveBeenCalledWith(`${BASE}/about?v=5`, expect.any(Response))
  })

  it('serves a stored copy as HIT without calling the handler', async () => {
    cache.match.mockResolvedValueOnce(htmlResponse('<p>stored</p>'))
    const handler = vi.fn(async () => htmlResponse('<p>fresh</p>'))
    const response = await withEdgeCache(new Request(`${BASE}/about`), liveEnv(), ctx(), handler)
    expect(handler).not.toHaveBeenCalled()
    expect(response.headers.get('x-edge-cache')).toBe('HIT')
    expect(await response.text()).toBe('<p>stored</p>')
  })

  it('falls through to the handler when the cache read throws', async () => {
    cache.match.mockRejectedValueOnce(new Error('cache down'))
    const handler = vi.fn(async () => htmlResponse())
    const response = await withEdgeCache(new Request(`${BASE}/about`), liveEnv(), ctx(), handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
  })

  it('bypasses for a signed-in visitor with a reason header', async () => {
    const handler = vi.fn(async () => htmlResponse())
    const response = await withEdgeCache(
      new Request(`${BASE}/about`, { headers: { Cookie: 'engage-token=abc' } }),
      liveEnv(),
      ctx(),
      handler,
    )
    expect(handler).toHaveBeenCalledTimes(1)
    expect(response.headers.get('x-edge-cache')).toBe('BYPASS(signed-in)')
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('honours a never-cache cookie from the settings', async () => {
    const handler = vi.fn(async () => htmlResponse())
    const response = await withEdgeCache(
      new Request(`${BASE}/about`, { headers: { Cookie: 'wordpress_logged_in=1' } }),
      liveEnv(),
      ctx(),
      handler,
    )
    expect(response.headers.get('x-edge-cache')).toBe('BYPASS(never-cookie)')
  })

  it('never stores a POST and never looks in the cache for it', async () => {
    const handler = vi.fn(async () => htmlResponse())
    await withEdgeCache(new Request(`${BASE}/about`, { method: 'POST' }), liveEnv(), ctx(), handler)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(cache.match).not.toHaveBeenCalled()
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('does not store a 500 page', async () => {
    const handler = vi.fn(async () => new Response('oops', { status: 500, headers: { 'Content-Type': 'text/html' } }))
    const response = await withEdgeCache(new Request(`${BASE}/about`), liveEnv(), ctx(), handler)
    expect(response.headers.get('x-edge-cache')).toBe('MISS')
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('does not store a page that sets a cookie', async () => {
    const handler = vi.fn(async () => htmlResponse('<p>x</p>', { 'Set-Cookie': 'a=1' }))
    await withEdgeCache(new Request(`${BASE}/about`), liveEnv(), ctx(), handler)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('strips utm parameters from the cache key', async () => {
    cache.match.mockResolvedValueOnce(undefined)
    const handler = vi.fn(async () => htmlResponse())
    await withEdgeCache(new Request(`${BASE}/about?utm_source=news`), liveEnv(), ctx(), handler)
    expect(cache.match).toHaveBeenCalledWith(`${BASE}/about?v=5`)
  })
})

describe('storedCopy', () => {
  it('sets the shared-cache TTL and drops the debug header', () => {
    const source = new Response('x', { status: 200, headers: { 'Content-Type': 'text/html', 'x-edge-cache': 'MISS' } })
    const copy = storedCopy(source, 900)
    expect(copy.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=900')
    expect(copy.headers.get('x-edge-cache')).toBeNull()
  })
})
