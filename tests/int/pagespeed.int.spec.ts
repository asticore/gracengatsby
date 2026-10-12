// @vitest-environment node
/**
 * PageSpeed Insights: parsing, scoring bands, URL building (SSRF safety), the Google call with a mocked
 * fetch (rate limit, timeout, size cap), the results store and the after-publish queue on a real D1.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import type { Drizzle } from '@/localapi/migrate'
import { runInternalMigrate } from '@/migrations/runInternalMigrate'
import { cleanText, parsePsiResponse, safeJson } from '@/features/pagespeed/parse'
import { buildPsiUrl, PSI_ENDPOINT, runPageSpeed } from '@/features/pagespeed/psi'
import { enqueueTest, runDueTests } from '@/features/pagespeed/queue'
import { listHistory, listWorst, saveResult } from '@/features/pagespeed/store'
import { isPublicOrigin, publicPath, resolveTarget } from '@/features/pagespeed/target'
import { formatMetric, metricBand, scoreBand, scoreDelta } from '@/features/pagespeed/types'

const audit = (numericValue: number, extra: Record<string, unknown> = {}) => ({ numericValue, ...extra })

const PSI_FIXTURE = {
  lighthouseResult: {
    categories: {
      performance: {
        score: 0.874,
        auditRefs: [
          { id: 'render-blocking-resources', group: 'load-opportunities' },
          { id: 'unused-javascript', group: 'load-opportunities' },
          { id: 'dom-size', group: 'diagnostics' },
          { id: 'uses-passive-event-listeners', group: 'diagnostics' },
        ],
      },
      accessibility: { score: 1 },
      'best-practices': { score: 0.5 },
      seo: { score: 0.92 },
    },
    audits: {
      'largest-contentful-paint': audit(2100),
      'cumulative-layout-shift': audit(0.3),
      'total-blocking-time': audit(150),
      'first-contentful-paint': audit(3500),
      'speed-index': audit(3000),
      'server-response-time': audit(900),
      'render-blocking-resources': {
        title: 'Eliminate render-blocking resources [Learn more](https://web.dev/x)',
        score: 0.2,
        scoreDisplayMode: 'numeric',
        details: { type: 'opportunity', overallSavingsMs: 450, overallSavingsBytes: 2048 },
      },
      'unused-javascript': {
        title: 'Reduce unused JavaScript',
        score: 0.4,
        scoreDisplayMode: 'numeric',
        details: { type: 'opportunity', overallSavingsMs: 900, overallSavingsBytes: 150000 },
      },
      'dom-size': { title: 'Avoid an excessive DOM size', score: 0.5, scoreDisplayMode: 'numeric', displayValue: '1,800 elements', details: { type: 'table' } },
      'uses-passive-event-listeners': { title: 'Fine', score: 1, scoreDisplayMode: 'binary' },
    },
  },
  loadingExperience: {
    overall_category: 'AVERAGE',
    origin_fallback: true,
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: 'AVERAGE' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: 'FAST' },
      INTERACTION_TO_NEXT_PAINT: { percentile: 640, category: 'SLOW' },
    },
  },
}

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })

describe('pagespeed scoring helpers', () => {
  it('bands scores 90+ / 50-89 / under 50 and handles never-run', () => {
    expect(scoreBand(95)).toBe('good')
    expect(scoreBand(90)).toBe('good')
    expect(scoreBand(89)).toBe('needs-work')
    expect(scoreBand(50)).toBe('needs-work')
    expect(scoreBand(49)).toBe('poor')
    expect(scoreBand(null)).toBeNull()
  })

  it('bands Core Web Vitals on the web.dev thresholds', () => {
    expect(metricBand('lcp', 2500)).toBe('good')
    expect(metricBand('lcp', 3000)).toBe('needs-work')
    expect(metricBand('lcp', 4001)).toBe('poor')
    expect(metricBand('cls', 0.1)).toBe('good')
    expect(metricBand('cls', 0.26)).toBe('poor')
    expect(metricBand('inp', 201)).toBe('needs-work')
  })

  it('formats units and deltas', () => {
    expect(formatMetric('lcp', 2100)).toBe('2.1 s')
    expect(formatMetric('tbt', 150)).toBe('150 ms')
    expect(formatMetric('cls', 0.12345)).toBe('0.123')
    expect(scoreDelta(80, 70)).toEqual({ change: 10, direction: 'up' })
    expect(scoreDelta(60, 70)).toEqual({ change: -10, direction: 'down' })
    expect(scoreDelta(60, 60)?.direction).toBe('same')
    expect(scoreDelta(60, null)).toBeNull()
  })
})

describe('parsePsiResponse', () => {
  const report = parsePsiResponse(PSI_FIXTURE)

  it('reads the four category scores as 0-100 integers', () => {
    expect(report?.scores).toEqual({ performance: 87, accessibility: 100, bestPractices: 50, seo: 92 })
  })

  it('reads lab metrics with bands', () => {
    expect(report?.metrics.lcp).toEqual({ value: 2100, band: 'good' })
    expect(report?.metrics.cls?.band).toBe('poor')
    expect(report?.metrics.fcp?.band).toBe('poor')
    expect(report?.metrics.ttfb?.band).toBe('needs-work')
  })

  it('reads field data and scales CLS', () => {
    expect(report?.fieldData?.overall).toBe('needs-work')
    expect(report?.fieldData?.originFallback).toBe(true)
    expect(report?.fieldData?.metrics.cls?.percentile).toBeCloseTo(0.05)
    expect(report?.fieldData?.metrics.inp?.band).toBe('poor')
  })

  it('sorts opportunities by saving, strips links, and lists failing diagnostics', () => {
    expect(report?.suggestions.opportunities.map((o) => o.id)).toEqual(['unused-javascript', 'render-blocking-resources'])
    expect(report?.suggestions.opportunities[1].title).toBe('Eliminate render-blocking resources Learn more')
    expect(report?.suggestions.diagnostics.map((d) => d.id)).toEqual(['dom-size'])
  })

  it('returns null for an empty or malformed response and null field data when absent', () => {
    expect(parsePsiResponse(null)).toBeNull()
    expect(parsePsiResponse({})).toBeNull()
    expect(parsePsiResponse({ lighthouseResult: { categories: {}, audits: {} } })).toBeNull()
    expect(parsePsiResponse({ lighthouseResult: { categories: { seo: { score: 1 } } } })?.fieldData).toBeNull()
  })

  it('cleans text and trims stored JSON to a safe size', () => {
    expect(cleanText('<b>x</b> [a](http://evil) `y`')).toBe('bx/b a y')
    const big = { opportunities: Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: 'x'.repeat(900) })), diagnostics: [] as unknown[] }
    expect(safeJson(big, 2000).length).toBeLessThanOrEqual(2000)
    expect(safeJson({ a: 1 })).toBe('{"a":1}')
  })
})

describe('target URL (SSRF safety)', () => {
  const noParent = async (): Promise<null> => null

  it('builds public paths from slugs only', async () => {
    expect(await publicPath('posts', { slug: 'hello' }, noParent)).toBe('/blog/hello')
    expect(await publicPath('products', { slug: 'tee' }, noParent)).toBe('/shop/tee')
    expect(await publicPath('events', { slug: 'gala' }, noParent)).toBe('/events/gala')
    expect(await publicPath('pages', { isHomepage: true, slug: 'x' }, noParent)).toBe('/')
    const parent = { slug: 'about' }
    expect(await publicPath('pages', { slug: 'team', parent: 4 }, async (id) => (id === 4 ? parent : null))).toBe('/about/team')
  })

  it('refuses slugs that could change the target', async () => {
    expect(await publicPath('posts', { slug: '../admin' }, noParent)).toBeNull()
    expect(await publicPath('posts', { slug: 'a?b=c' }, noParent)).toBeNull()
    expect(await publicPath('posts', { slug: 'a#b' }, noParent)).toBeNull()
    expect(await publicPath('posts', { slug: '' }, noParent)).toBeNull()
    expect(await publicPath('pages', { slug: 'x', parent: 9 }, noParent)).toBeNull()
  })

  it('only accepts a public https origin', () => {
    expect(isPublicOrigin('https://example.com')).toBe(true)
    for (const bad of ['http://example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.5', 'https://[::1]', 'https://intranet', 'https://a.internal', 'https://user:pw@example.com', 'https://example.com:8443', 'not a url']) {
      expect(isPublicOrigin(bad), bad).toBe(false)
    }
  })

  it('explains why a draft or unaddressable document cannot be tested', () => {
    const draft = resolveTarget({ status: 'draft', path: '/x', origin: 'https://example.com' })
    expect(draft.ok).toBe(false)
    expect(draft.ok === false && draft.reason).toMatch(/draft/i)
    expect(resolveTarget({ status: 'published', path: null, origin: 'https://example.com' }).ok).toBe(false)
    expect(resolveTarget({ status: 'published', path: '/x', origin: 'http://localhost:3000' }).ok).toBe(false)
    expect(resolveTarget({ status: 'published', path: '/x', origin: 'https://example.com/' })).toEqual({ ok: true, url: 'https://example.com/x' })
  })
})

describe('runPageSpeed with a mocked fetch', () => {
  it('requests all four categories from the fixed endpoint and parses the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(PSI_FIXTURE))
    const outcome = await runPageSpeed({ url: 'https://example.com/a', strategy: 'mobile', apiKey: 'K', fetchImpl })
    expect(outcome.ok).toBe(true)
    const called = String(fetchImpl.mock.calls[0][0])
    expect(called.startsWith(`${PSI_ENDPOINT}?`)).toBe(true)
    const params = new URL(called).searchParams
    expect(params.getAll('category')).toEqual(['performance', 'accessibility', 'best-practices', 'seo'])
    expect(params.get('strategy')).toBe('mobile')
    expect(params.get('key')).toBe('K')
    expect(params.get('url')).toBe('https://example.com/a')
  })

  it('omits the key when none is set', () => {
    expect(new URL(buildPsiUrl('https://example.com', 'desktop')).searchParams.has('key')).toBe(false)
  })

  it('gives a friendly rate-limit message (429 and 403 quota)', async () => {
    const limited = await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', fetchImpl: async () => new Response('{}', { status: 429 }) })
    expect(limited.ok === false && limited.code).toBe('rate-limited')
    expect(limited.ok === false && limited.message).toMatch(/API key/)
    const quota = await runPageSpeed({
      url: 'https://example.com',
      strategy: 'mobile',
      apiKey: 'K',
      fetchImpl: async () => jsonResponse({ error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } }, { status: 403 }),
    })
    expect(quota.ok === false && quota.code).toBe('rate-limited')
  })

  it('reports a bad key and an unreachable page', async () => {
    const badKey = await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', apiKey: 'x', fetchImpl: async () => jsonResponse({ error: { message: 'API key not valid' } }, { status: 400 }) })
    expect(badKey.ok === false && badKey.code).toBe('bad-key')
    const unreachable = await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', fetchImpl: async () => jsonResponse({ error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } }, { status: 500 }) })
    expect(unreachable.ok === false && unreachable.code).toBe('unreachable')
  })

  it('times out and aborts the request', async () => {
    const fetchImpl = (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    const outcome = await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', fetchImpl, timeoutMs: 20 })
    expect(outcome.ok === false && outcome.code).toBe('timeout')
  })

  it('discards an oversized response (declared and streamed)', async () => {
    const declared = await runPageSpeed({
      url: 'https://example.com',
      strategy: 'mobile',
      maxBytes: 100,
      fetchImpl: async () => new Response('{}', { headers: { 'content-length': '5000' } }),
    })
    expect(declared.ok === false && declared.code).toBe('too-large')
    const streamed = await runPageSpeed({
      url: 'https://example.com',
      strategy: 'mobile',
      maxBytes: 100,
      fetchImpl: async () => new Response(JSON.stringify({ pad: 'x'.repeat(500) })),
    })
    expect(streamed.ok === false && streamed.code).toBe('too-large')
  })

  it('rejects a non-JSON or empty result', async () => {
    expect((await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', fetchImpl: async () => new Response('<html>') })).ok).toBe(false)
    expect((await runPageSpeed({ url: 'https://example.com', strategy: 'mobile', fetchImpl: async () => jsonResponse({}) })).ok).toBe(false)
  })
})

describe('results store and after-publish queue (real D1)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Drizzle
  const report = parsePsiResponse(PSI_FIXTURE)!

  beforeAll(async () => {
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    await runInternalMigrate(proxy.env.D1, consoleLogger)
    db = drizzle(proxy.env.D1) as unknown as Drizzle
    await proxy.env.D1.prepare("INSERT INTO eg_posts (id, title, slug, _status) VALUES (7, 'Hello', 'hello', 'published')").run()
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('stores a result, lists history newest first and denormalises the score', async () => {
    await saveResult(db, { collection: 'posts', docId: 7, url: 'https://example.com/blog/hello', strategy: 'mobile', source: 'manual', report, now: new Date('2026-10-01T10:00:00Z') })
    const better = { ...report, scores: { ...report.scores, performance: 95 } }
    await saveResult(db, { collection: 'posts', docId: 7, url: 'https://example.com/blog/hello', strategy: 'mobile', source: 'manual', report: better, now: new Date('2026-10-02T10:00:00Z') })
    const history = await listHistory(db, 'posts', 7, 'mobile')
    expect(history.map((h) => h.scores.performance)).toEqual([95, 87])
    expect(history[1].suggestions.opportunities[0].id).toBe('unused-javascript')
    const row = (await proxy.env.D1.prepare('SELECT pagespeed_score, pagespeed_at FROM eg_posts WHERE id = 7').first()) as { pagespeed_score: number; pagespeed_at: string }
    expect(row.pagespeed_score).toBe(95)
    expect(row.pagespeed_at).toBe('2026-10-02T10:00:00.000Z')
  })

  it('does not let a desktop run replace an existing mobile score', async () => {
    await saveResult(db, { collection: 'posts', docId: 7, url: 'https://example.com/blog/hello', strategy: 'desktop', source: 'manual', report: { ...report, scores: { ...report.scores, performance: 20 } } })
    const row = (await proxy.env.D1.prepare('SELECT pagespeed_score FROM eg_posts WHERE id = 7').first()) as { pagespeed_score: number }
    expect(row.pagespeed_score).toBe(95)
    expect((await listHistory(db, 'posts', 7, 'desktop')).length).toBe(1)
  })

  it('lists the worst pages by latest mobile score', async () => {
    const worst = await listWorst(db, 5)
    expect(worst[0]).toMatchObject({ collection: 'posts', docId: 7, performance: 95 })
  })

  const engineFor = (settings: { testAfterPublish: boolean; dailyCap?: number }, status = 'published') => ({
    findGlobal: async (args: Record<string, unknown>) =>
      args.slug === 'speed-settings' ? { pagespeed: { testAfterPublish: settings.testAfterPublish, dailyCap: settings.dailyCap ?? 20 } } : { google: { pageSpeedApiKey: 'KEY' } },
    findByID: async () => ({ id: 7, slug: 'hello', _status: status }),
  })
  const ok = async (..._args: unknown[]): Promise<Response> => jsonResponse(PSI_FIXTURE)

  it('does nothing and clears the queue while "Test after publish" is off', async () => {
    await enqueueTest(db, 'posts', 7, new Date('2026-10-03T09:00:00Z'))
    const fetchImpl = vi.fn(ok)
    const result = await runDueTests(engineFor({ testAfterPublish: false }), db, new Date('2026-10-03T10:00:00Z'), fetchImpl)
    expect(result.skipped).toBe('off')
    expect(fetchImpl).not.toHaveBeenCalled()
    const left = (await proxy.env.D1.prepare('SELECT COUNT(*) AS n FROM eg_pagespeed_queue').first()) as { n: number }
    expect(left.n).toBe(0)
  })

  it('waits a few minutes after publish, then runs one mobile test with the key', async () => {
    const published = new Date('2026-10-04T09:00:00Z')
    await enqueueTest(db, 'posts', 7, published)
    const fetchImpl = vi.fn(ok)
    const early = await runDueTests(engineFor({ testAfterPublish: true }), db, new Date('2026-10-04T09:02:00Z'), fetchImpl)
    expect(early.skipped).toBe('empty')
    const due = await runDueTests(engineFor({ testAfterPublish: true }), db, new Date('2026-10-04T09:06:00Z'), fetchImpl)
    expect(due.ran).toBe(1)
    const params = new URL(String(fetchImpl.mock.calls[0][0])).searchParams
    expect(params.get('strategy')).toBe('mobile')
    expect(params.get('key')).toBe('KEY')
    expect(params.get('url')).toBe('https://gracengatsby.com/blog/hello')
    const auto = (await listHistory(db, 'posts', 7, 'mobile'))[0]
    expect(auto.source).toBe('auto')
  })

  it('stops for the day once the cap is reached', async () => {
    await enqueueTest(db, 'posts', 7, new Date('2026-10-04T09:30:00Z'))
    const fetchImpl = vi.fn(ok)
    const result = await runDueTests(engineFor({ testAfterPublish: true, dailyCap: 1 }), db, new Date('2026-10-04T10:00:00Z'), fetchImpl)
    expect(result.skipped).toBe('cap')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('retries a rate-limited test later, and drops a document that is no longer published', async () => {
    const day = new Date('2026-10-05T09:10:00Z')
    await proxy.env.D1.prepare('DELETE FROM eg_pagespeed_queue').run()
    await enqueueTest(db, 'posts', 7, new Date('2026-10-05T09:00:00Z'))
    const limited = await runDueTests(engineFor({ testAfterPublish: true }), db, day, async () => new Response('{}', { status: 429 }))
    expect(limited.errors.length).toBe(1)
    const queued = (await proxy.env.D1.prepare('SELECT run_at, attempts FROM eg_pagespeed_queue').first()) as { run_at: string; attempts: number }
    expect(queued.attempts).toBe(1)
    expect(new Date(queued.run_at).getTime()).toBeGreaterThan(day.getTime())

    await proxy.env.D1.prepare('UPDATE eg_pagespeed_queue SET run_at = ?').bind('2026-10-05T09:00:00.000Z').run()
    const fetchImpl = vi.fn(ok)
    await runDueTests(engineFor({ testAfterPublish: true }, 'draft'), db, day, fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
    const left = (await proxy.env.D1.prepare('SELECT COUNT(*) AS n FROM eg_pagespeed_queue').first()) as { n: number }
    expect(left.n).toBe(0)
  })
})

describe('review fixes: parameterised list column update', () => {
  it('refreshListColumn no longer builds SQL from the timestamp text', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('src/features/pagespeed/store.ts', 'utf8')
    expect(source).not.toMatch(/fetchedAt\.replace/)
  })
})
