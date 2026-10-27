// @vitest-environment node
/**
 * Google dashboard widgets: date windows, the Search Console, GA4, AdSense and PageSpeed shapers, the
 * request bodies sent to Google (through a fake requester, so no network), the widget states (not
 * connected, not set up, error, ok), the five-minute cache, and the per-page lookup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { readGoogleConnection } = vi.hoisted(() => ({ readGoogleConnection: vi.fn() }))

vi.mock('@/features/google/auth', () => ({
  readGoogleConnection,
  getGoogleAccessToken: vi.fn(),
}))

import { cached, clearWidgetCache, WIDGET_CACHE_MS } from '@/features/google/dashboard/cache'
import { adsenseAccountOrNull, ga4PropertyNumber, searchSiteOrNull } from '@/features/google/dashboard/connection'
import { changeText, formatMoney, percentChange, pathOf } from '@/features/google/dashboard/format'
import { recentWindows, searchWindows, twoPeriods } from '@/features/google/dashboard/ranges'
import { fetchSearchConsole, fetchPageSearch, loadSearchWidget, shapeRows, shapeTotals, NOT_SET_UP as SEARCH_NOT_SET_UP } from '@/features/google/dashboard/searchConsole'
import { fetchAnalytics, loadAnalyticsWidget, shapeReport, totalsFor } from '@/features/google/dashboard/analytics'
import { loadAdSenseWidget, reportUrl, shapeAdSense } from '@/features/google/dashboard/adsense'
import { summarisePageSpeed } from '@/features/google/dashboard/pagespeedSummary'
import { loadPageStats } from '@/features/google/dashboard/pageStats'
import type { GoogleRequester } from '@/features/google/dashboard/requester'

const engine = {} as never
const TODAY = new Date('2026-10-14T12:00:00Z')

const connected = (extra: Record<string, unknown> = {}) => ({
  connected: true,
  connectedAt: '2026-10-01T00:00:00.000Z',
  searchConsoleSite: 'sc-domain:example.com',
  ga4PropertyId: 'properties/123456789',
  adsenseAccountId: 'accounts/pub-1234567890',
  adsensePublisherId: '',
  ...extra,
})

/** A requester that answers Search Console, GA4 and AdSense URLs with canned JSON and records every call. */
function fakeRequester(answer: (url: string, body?: unknown) => unknown) {
  const calls: { method: 'get' | 'post'; url: string; body?: unknown }[] = []
  const req: GoogleRequester = {
    get: async (_e, url) => {
      calls.push({ method: 'get', url })
      return answer(url)
    },
    post: async (_e, url, body) => {
      calls.push({ method: 'post', url, body })
      return answer(url, body)
    },
  }
  return { req, calls }
}

beforeEach(() => {
  clearWidgetCache()
  readGoogleConnection.mockReset()
})

describe('date windows', () => {
  it('ends Search Console data three days back and covers 28 days, with the 28 days before', () => {
    const { range, previousRange } = searchWindows(TODAY)
    expect(range).toEqual({ from: '2026-09-14', to: '2026-10-11' })
    expect(previousRange).toEqual({ from: '2026-08-17', to: '2026-09-13' })
  })

  it('ends Analytics and AdSense yesterday', () => {
    const { range } = recentWindows(TODAY)
    expect(range).toEqual({ from: '2026-09-16', to: '2026-10-13' })
  })

  it('keeps both windows exactly 28 days long', () => {
    const { range, previousRange } = twoPeriods(TODAY, 1)
    const days = (r: { from: string; to: string }) => (Date.parse(r.to) - Date.parse(r.from)) / 86400000 + 1
    expect(days(range)).toBe(28)
    expect(days(previousRange)).toBe(28)
  })
})

describe('Search Console shapers', () => {
  it('adds up the rows of a totals query and weights the position by impressions', () => {
    const totals = shapeTotals({
      rows: [
        { clicks: 10, impressions: 100, position: 2 },
        { clicks: 30, impressions: 300, position: 4 },
      ],
    })
    expect(totals.clicks).toBe(40)
    expect(totals.impressions).toBe(400)
    expect(totals.ctr).toBeCloseTo(0.1)
    expect(totals.position).toBeCloseTo(3.5)
  })

  it('returns zeros when Google sends no rows', () => {
    expect(shapeTotals({})).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
    expect(shapeTotals(null)).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 })
  })

  it('keeps the first keys as text and stops at the limit', () => {
    const rows = shapeRows({ rows: Array.from({ length: 12 }, (_, i) => ({ keys: [`q${i}`], clicks: i, impressions: 1, ctr: 0, position: 1 })) })
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ key: 'q0', clicks: 0 })
  })

  it('sends the right bodies for the site-wide report and encodes the site in the URL', async () => {
    const { req, calls } = fakeRequester(() => ({ rows: [] }))
    const data = await fetchSearchConsole(engine, 'sc-domain:example.com', TODAY, req)
    expect(data.range.from).toBe('2026-09-14')
    expect(calls).toHaveLength(4)
    expect(calls.every((c) => c.method === 'post')).toBe(true)
    expect(calls[0].url).toBe('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query')
    expect(calls[2].body).toMatchObject({ dimensions: ['query'], rowLimit: 10 })
    expect(calls[3].body).toMatchObject({ dimensions: ['page'], rowLimit: 10 })
  })

  it('limits the page report to one exact address', async () => {
    const { req, calls } = fakeRequester(() => ({ rows: [] }))
    await fetchPageSearch(engine, 'https://example.com/', 'https://example.com/shop/hat', TODAY, req)
    expect(calls[0].body).toMatchObject({
      dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: 'https://example.com/shop/hat' }] }],
    })
  })

  it('validates the site value before using it', () => {
    expect(searchSiteOrNull('sc-domain:example.com')).toBe('sc-domain:example.com')
    expect(searchSiteOrNull('https://example.com/')).toBe('https://example.com/')
    expect(searchSiteOrNull('example.com')).toBeNull()
    expect(searchSiteOrNull('sc-domain:evil.com/../x')).toBeNull()
    expect(searchSiteOrNull(undefined)).toBeNull()
  })
})

describe('GA4 shapers and loader', () => {
  it('reads the named windows from the dateRange dimension', () => {
    const rows = shapeReport({
      rows: [
        { dimensionValues: [{ value: 'current' }], metricValues: [{ value: '120' }, { value: '150' }] },
        { dimensionValues: [{ value: 'previous' }], metricValues: [{ value: '100' }, { value: '110' }] },
      ],
    })
    expect(totalsFor(rows, 'current')).toEqual({ users: 120, sessions: 150 })
    expect(totalsFor(rows, 'previous')).toEqual({ users: 100, sessions: 110 })
  })

  it('builds the report from a checked property id only', async () => {
    expect(ga4PropertyNumber('properties/123456789')).toBe('123456789')
    expect(ga4PropertyNumber('123456789')).toBe('123456789')
    expect(ga4PropertyNumber('123/../../x')).toBeNull()

    const { req, calls } = fakeRequester(() => ({ rows: [] }))
    const data = await fetchAnalytics(engine, '123456789', TODAY, req)
    expect(calls).toHaveLength(3)
    expect(calls[0].url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport')
    expect(data.current).toEqual({ users: 0, sessions: 0 })
    expect(data.topPages).toEqual([])
  })

  it('reports not connected and not set up before calling Google', async () => {
    readGoogleConnection.mockResolvedValueOnce({ connected: false, connectedAt: '' })
    expect(await loadAnalyticsWidget(engine, TODAY)).toEqual({ state: 'not-connected' })

    readGoogleConnection.mockResolvedValueOnce(connected({ ga4PropertyId: '' }))
    const result = await loadAnalyticsWidget(engine, TODAY, fakeRequester(() => ({})).req)
    expect(result.state).toBe('not-set-up')
  })
})

describe('AdSense', () => {
  it('builds a read-only report URL with each metric once', () => {
    const url = reportUrl('accounts/pub-1234567890', { from: '2026-09-16', to: '2026-10-13' })
    expect(url.startsWith('https://adsense.googleapis.com/v2/accounts/pub-1234567890/reports:generate?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('startDate.month')).toBe('9')
    expect(params.getAll('metrics')).toEqual(['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'CLICKS'])
  })

  it('maps the totals row by header name and keeps the currency', () => {
    const data = shapeAdSense(
      {
        headers: [{ name: 'ESTIMATED_EARNINGS' }, { name: 'PAGE_VIEWS' }, { name: 'CLICKS' }],
        totals: { cells: [{ value: '12.5' }, { value: '900' }, { value: '7' }] },
        currencyCode: 'GBP',
      },
      { from: 'a', to: 'b' },
    )
    expect(data).toMatchObject({ earnings: 12.5, pageViews: 900, clicks: 7, currency: 'GBP' })
    expect(formatMoney(data.earnings, data.currency)).toBe('GBP 12.50')
  })

  it('accepts both account spellings and rejects anything else', () => {
    expect(adsenseAccountOrNull('pub-42')).toBe('accounts/pub-42')
    expect(adsenseAccountOrNull('accounts/pub-42')).toBe('accounts/pub-42')
    expect(adsenseAccountOrNull('accounts/../x')).toBeNull()
  })

  it('loads through the cache and returns ok', async () => {
    readGoogleConnection.mockResolvedValueOnce(connected())
    const { req } = fakeRequester(() => ({ headers: [], totals: { cells: [] } }))
    const result = await loadAdSenseWidget(engine, TODAY, req)
    expect(result.state).toBe('ok')
  })
})

describe('widget states for Search Console', () => {
  it('is not connected when there is no connection', async () => {
    readGoogleConnection.mockResolvedValueOnce({ connected: false, connectedAt: '', searchConsoleSite: '' })
    expect(await loadSearchWidget(engine, TODAY)).toEqual({ state: 'not-connected' })
  })

  it('is not set up when no property is chosen', async () => {
    readGoogleConnection.mockResolvedValueOnce(connected({ searchConsoleSite: '' }))
    expect(await loadSearchWidget(engine, TODAY)).toEqual({ state: 'not-set-up', message: SEARCH_NOT_SET_UP })
  })

  it('shows a plain error when Google refuses, without any token', async () => {
    readGoogleConnection.mockResolvedValueOnce(connected())
    const req: GoogleRequester = {
      get: async () => ({}),
      post: async () => {
        throw Object.assign(new Error('insufficient scope'), { status: 403 })
      },
    }
    const result = await loadSearchWidget(engine, TODAY, req)
    expect(result.state).toBe('error')
    if (result.state === 'error') expect(result.message).toContain('403')
  })

  it('returns ok data and reuses the cached copy for five minutes', async () => {
    readGoogleConnection.mockResolvedValue(connected())
    const { req, calls } = fakeRequester(() => ({ rows: [{ clicks: 5, impressions: 50, position: 3 }] }))
    const first = await loadSearchWidget(engine, TODAY, req)
    const second = await loadSearchWidget(engine, TODAY, req)
    expect(first.state).toBe('ok')
    expect(second.state).toBe('ok')
    expect(calls).toHaveLength(4)
  })
})

describe('the five-minute cache', () => {
  it('returns the stored value until it expires, and skips storing values it is told to skip', async () => {
    let clock = 0
    const now = () => clock
    let loads = 0
    const load = async () => ++loads
    expect(await cached('k', load, () => true, now)).toBe(1)
    expect(await cached('k', load, () => true, now)).toBe(1)
    clock = WIDGET_CACHE_MS + 1
    expect(await cached('k', load, () => true, now)).toBe(2)
    expect(await cached('e', load, () => false, now)).toBe(3)
    expect(await cached('e', load, () => false, now)).toBe(4)
  })
})

describe('PageSpeed summary', () => {
  it('averages the latest mobile scores and lists the lowest five first', () => {
    const rows = [
      { collection: 'pages', docId: 1, url: 'https://x.com/a', performance: 90 },
      { collection: 'posts', docId: 2, url: 'https://x.com/blog/b', performance: 40 },
      { collection: 'products', docId: 3, url: 'https://x.com/shop/c', performance: 61 },
      { collection: 'pages', docId: 4, url: 'https://x.com/d', performance: 20 },
      { collection: 'events', docId: 5, url: 'https://x.com/events/e', performance: 99 },
      { collection: 'pages', docId: 6, url: 'https://x.com/f', performance: 70 },
    ]
    const summary = summarisePageSpeed(rows)
    expect(summary.tested).toBe(6)
    expect(summary.averagePerformance).toBe(63)
    expect(summary.worst.map((w) => w.performance)).toEqual([20, 40, 61, 70, 90])
    expect(summary.worst[0].editHref).toBe(`/admin/content/pages/4`)
  })

  it('has no average when nothing is tested', () => {
    expect(summarisePageSpeed([])).toEqual({ tested: 0, averagePerformance: null, worst: [] })
  })
})

describe('per-page stats', () => {
  it('reports not connected without resolving the page', async () => {
    readGoogleConnection.mockResolvedValueOnce({ connected: false, connectedAt: '' })
    const resolve = vi.fn()
    expect(await loadPageStats(engine, { collection: 'pages', id: 3 }, TODAY, undefined, resolve as never)).toEqual({ state: 'not-connected' })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('says why an unpublished page has no address', async () => {
    readGoogleConnection.mockResolvedValueOnce(connected())
    const resolve = vi.fn().mockResolvedValue({ found: true, target: { ok: false, reason: 'This is a draft.' } })
    const result = await loadPageStats(engine, { collection: 'pages', id: 3 }, TODAY, fakeRequester(() => ({})).req, resolve as never)
    expect(result).toEqual({ state: 'unpublished', message: 'This is a draft.' })
  })

  it('reads the page numbers for the address the server built', async () => {
    readGoogleConnection.mockResolvedValueOnce(connected())
    const resolve = vi.fn().mockResolvedValue({ found: true, target: { ok: true, url: 'https://gracengatsby.com/shop/hat' } })
    const { req } = fakeRequester(() => ({ rows: [{ clicks: 4, impressions: 40, position: 2 }] }))
    const result = await loadPageStats(engine, { collection: 'products', id: 9 }, TODAY, req, resolve as never)
    expect(result.state).toBe('ok')
    if (result.state === 'ok') {
      expect(result.data.url).toBe('https://gracengatsby.com/shop/hat')
      expect(result.data.totals.clicks).toBe(4)
    }
  })
})

describe('formatting helpers', () => {
  it('describes change against the previous period', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(changeText(90, 100)).toBe('-10%')
    expect(changeText(100, 100)).toBe('no change')
    expect(changeText(5, 0)).toBe('')
  })

  it('shortens a page address to its path', () => {
    expect(pathOf('https://gracengatsby.com/shop/hat?x=1')).toBe('/shop/hat?x=1')
    expect(pathOf('not a url')).toBe('not a url')
  })
})
