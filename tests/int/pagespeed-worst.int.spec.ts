// @vitest-environment node
/**
 * "Slowest pages": the stored-results query (latest run per page, one strategy at a time), the two failing
 * audits per row, the access filter, and the GET route's auth and input checks.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { consoleLogger } from '@/localapi/logger'
import type { Drizzle } from '@/localapi/migrate'
import { up } from '@/migrations/20261014_300000_pagespeed'
import { saveResult } from '@/features/pagespeed/store'
import type { PageSpeedReport } from '@/features/pagespeed/types'
import { failingAuditsFrom, getWorstPages, type WorstContext } from '@/features/pagespeed/worst'

const { getAdminContext, getCloudflareContext, drizzleMock } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  getCloudflareContext: vi.fn(),
  drizzleMock: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))
vi.mock('drizzle-orm/d1', () => ({ drizzle: drizzleMock }))

import { GET } from '@/app/(engage)/api/admin-pagespeed-worst/route'

const reportWith = (performance: number, opportunities: { id: string; title: string; savingsMs?: number; displayValue?: string }[] = []): PageSpeedReport => ({
  scores: { performance, accessibility: 90, bestPractices: 90, seo: 90 },
  metrics: {},
  fieldData: null,
  suggestions: { opportunities, diagnostics: [{ id: 'diag-1', title: 'Diagnostic one' }] },
})

const DOCS: Record<string, Record<number, { title: string }>> = {
  pages: { 1: { title: 'About us' }, 2: { title: 'Home' } },
  posts: { 7: { title: 'Hello world' } },
}

const engine = {
  findByID: async (args: Record<string, unknown>) => {
    const { collection, id } = args as { collection: string; id: number }
    return DOCS[collection]?.[id] ?? null
  },
}

const adminContext = (): WorstContext => ({ isAdmin: true, user: { id: 1, roles: ['admin'] }, can: () => true, permissions: {}, engine })

describe('failing audits from stored suggestions', () => {
  it('takes the two biggest opportunities first, then diagnostics', () => {
    const raw = JSON.stringify({
      opportunities: [
        { id: 'a', title: 'Biggest', savingsMs: 900, displayValue: 'Potential savings of 900 ms' },
        { id: 'b', title: 'Second', savingsMs: 400 },
        { id: 'c', title: 'Third', savingsMs: 100 },
      ],
      diagnostics: [{ id: 'd', title: 'Diagnostic' }],
    })
    expect(failingAuditsFrom(raw)).toEqual([
      { id: 'a', title: 'Biggest', displayValue: 'Potential savings of 900 ms' },
      { id: 'b', title: 'Second', displayValue: null },
    ])
  })

  it('returns nothing for missing, broken or empty data', () => {
    expect(failingAuditsFrom(null)).toEqual([])
    expect(failingAuditsFrom('not json')).toEqual([])
    expect(failingAuditsFrom(JSON.stringify({ opportunities: [{ title: 'No id' }] }))).toEqual([])
  })
})

describe('getWorstPages (real D1)', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
  let db: Drizzle

  beforeAll(async () => {
    // The route tests below mock drizzle-orm/d1 for the whole file, so take the real driver here.
    const actual = await vi.importActual<typeof import('drizzle-orm/d1')>('drizzle-orm/d1')
    proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
    db = actual.drizzle(proxy.env.D1) as unknown as Drizzle
    // The empty test database has no content tables yet, so make the minimal tables the PageSpeed columns need
    // (title, slug, status and the denormalised score columns), then create the PageSpeed tables with the
    // shipped migration itself. Idempotent, so it is safe on any database.
    await up({ db, engine: { logger: consoleLogger } } as never)
    await proxy.env.D1.prepare(
      'CREATE TABLE IF NOT EXISTS eg_pages (id integer PRIMARY KEY NOT NULL, title text, slug text, _status text, pagespeed_score numeric, pagespeed_at text)',
    ).run()
    await proxy.env.D1.prepare("INSERT INTO eg_pages (id, title, slug, _status) VALUES (1, 'About us', 'about', 'published'), (2, 'Home', 'home', 'published')").run()
    await proxy.env.D1.prepare(
      'CREATE TABLE IF NOT EXISTS eg_posts (id integer PRIMARY KEY NOT NULL, title text, slug text, _status text, pagespeed_score numeric, pagespeed_at text)',
    ).run()
    await proxy.env.D1.prepare("INSERT INTO eg_posts (id, title, slug, _status) VALUES (7, 'Hello world', 'hello', 'published')").run()

    const url = (path: string) => `https://example.com/${path}`
    const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`)
    // About us: an older 40, then the latest run 30 (only the latest counts).
    await saveResult(db, { collection: 'pages', docId: 1, url: url('about'), strategy: 'mobile', source: 'manual', report: reportWith(40), now: at(1) })
    await saveResult(db, {
      collection: 'pages',
      docId: 1,
      url: url('about'),
      strategy: 'mobile',
      source: 'manual',
      report: reportWith(30, [
        { id: 'unused-js', title: 'Remove unused JavaScript', savingsMs: 800, displayValue: 'Potential savings of 800 ms' },
        { id: 'big-images', title: 'Serve images in next-gen formats', savingsMs: 500 },
        { id: 'fonts', title: 'Preload fonts', savingsMs: 50 },
      ]),
      now: at(2),
    })
    await saveResult(db, { collection: 'posts', docId: 7, url: url('hello'), strategy: 'mobile', source: 'manual', report: reportWith(55), now: at(3) })
    await saveResult(db, { collection: 'pages', docId: 2, url: url(''), strategy: 'mobile', source: 'manual', report: reportWith(80), now: at(4) })
    await saveResult(db, { collection: 'pages', docId: 2, url: url(''), strategy: 'desktop', source: 'manual', report: reportWith(20), now: at(5) })
    // A result for a page that no longer exists must not show.
    await saveResult(db, { collection: 'pages', docId: 999, url: url('gone'), strategy: 'mobile', source: 'manual', report: reportWith(5), now: at(6) })
  }, 300_000)

  afterAll(async () => {
    await proxy.dispose()
  })

  it('lists the lowest mobile scores first, using the latest run per page', async () => {
    const pages = await getWorstPages({ db, context: adminContext() })
    expect(pages.map((p) => [p.collection, p.docId, p.score])).toEqual([
      ['pages', 1, 30],
      ['posts', 7, 55],
      ['pages', 2, 80],
    ])
    expect(pages[0]).toMatchObject({ title: 'About us', editHref: '/admin/collections/pages/1', url: 'https://example.com/about', band: 'poor' })
    expect(pages[0].lastRun).toBe('2026-10-02T10:00:00.000Z')
  })

  it('shows the top two failing audits per row, opportunities first, and falls back to diagnostics', async () => {
    const pages = await getWorstPages({ db, context: adminContext() })
    expect(pages[0].failingAudits.map((a) => a.id)).toEqual(['unused-js', 'big-images'])
    expect(pages[1].failingAudits.map((a) => a.id)).toEqual(['diag-1'])
  })

  it('switches to desktop results on request', async () => {
    const pages = await getWorstPages({ db, context: adminContext(), strategy: 'desktop' })
    expect(pages.map((p) => [p.docId, p.score])).toEqual([[2, 20]])
  })

  it('caps the list at the requested limit (max 10)', async () => {
    expect((await getWorstPages({ db, context: adminContext(), limit: 1 })).length).toBe(1)
    expect((await getWorstPages({ db, context: adminContext(), limit: 500 })).length).toBeLessThanOrEqual(10)
  })

  it('hides pages the viewer cannot read and anything without the PageSpeed permission', async () => {
    const noPermission: WorstContext = { isAdmin: false, user: { id: 2, roles: ['viewer'] }, can: () => false, permissions: {}, engine }
    expect(await getWorstPages({ db, context: noPermission })).toEqual([])

    const pagesOnly: WorstContext = {
      isAdmin: false,
      user: { id: 2, roles: ['viewer'] },
      can: () => true,
      permissions: { collections: { pages: { read: true }, posts: { read: false } } },
      engine,
    }
    const pages = await getWorstPages({ db, context: pagesOnly })
    expect(pages.every((p) => p.collection === 'pages')).toBe(true)
    expect(pages.map((p) => p.docId)).toEqual([1, 2])
  })
})

describe('GET /api/admin-pagespeed-worst', () => {
  const fakeDb = () => ({ run: vi.fn(), all: vi.fn(async () => []) })
  const get = (query = '') => GET(new Request(`http://x/api/admin-pagespeed-worst${query}`))

  beforeEach(() => {
    vi.clearAllMocks()
    getCloudflareContext.mockResolvedValue({ env: { D1: {} } })
    drizzleMock.mockReturnValue(fakeDb())
  })

  it('401 without a signed-in user or the PageSpeed permission', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: false, user: null, can: () => true, permissions: {}, engine })
    expect((await get()).status).toBe(401)
    getAdminContext.mockResolvedValue({ isAdmin: false, user: { id: 2 }, can: () => false, permissions: {}, engine })
    expect((await get()).status).toBe(401)
  })

  it('rejects an unknown strategy', async () => {
    getAdminContext.mockResolvedValue(adminContext())
    expect((await get('?strategy=tablet')).status).toBe(400)
  })

  it('returns the list for an admin, mobile by default, with no-store caching', async () => {
    getAdminContext.mockResolvedValue(adminContext())
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ strategy: 'mobile', pages: [] })
    const desktop = await get('?strategy=desktop')
    expect(await desktop.json()).toEqual({ strategy: 'desktop', pages: [] })
  })
})
