// @vitest-environment node
// "Clear inactive translations" against a fake engine: admin-only, dry run returns the count,
// only orphaned rows are deleted, a page that exists but is unreadable is never deleted.
import { describe, expect, it, vi } from 'vitest'

import { parseClearInactiveBody, runClearInactive, sourceIdFromItemKey } from '@/features/multilingual/clearInactive'

// Both switches must be on: the site feature (site-settings features) and the language group.
const SETTINGS = {
  language: { enabled: true, defaultLocale: 'en', activeLocales: ['en', 'fr'] },
  site: { features: { multilingual: true } },
}

type Doc = Record<string, unknown>

function fixture(extra: { translations?: Doc[] } = {}) {
  const pages: Doc[] = [
    { id: 1, title: 'Home', slug: 'home', updatedAt: '2026-10-01T00:00:00.000Z', seo: { metaTitle: 'SEO', metaDescription: '' } },
    { id: 2, title: 'Shop', slug: 'shop', updatedAt: '2026-10-01T00:00:00.000Z' },
  ]
  const translations: Doc[] = extra.translations ?? [
    { id: 101, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:1', fieldPath: 'title', value: 'Accueil', sourceText: 'Home', status: 'approved' },
    { id: 102, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:1', fieldPath: 'legacy', value: 'Orphan', sourceText: 'x', status: 'approved' },
    { id: 103, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:9', fieldPath: 'title', value: 'Lost', sourceText: 'Gone', status: 'approved' },
    { id: 104, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:2', fieldPath: 'title', value: 'Boutique', sourceText: 'Shop', status: 'approved' },
    { id: 105, locale: 'fr', sourceKind: 'interface', sourceId: 'interface', fieldPath: 'nav.home', value: 'Accueil', sourceText: 'Home', status: 'approved' },
  ]
  const deletes: Array<{ collection: string; id: unknown }> = []

  const engine = {
    findGlobal: vi.fn(async ({ slug }: { slug: string }) => {
      if (slug === 'language-settings') return { multilingual: SETTINGS.language }
      if (slug === 'site-settings') return SETTINGS.site
      return {}
    }),
    find: vi.fn(async (args: { collection: string; overrideAccess?: boolean; where?: Record<string, unknown> }) => {
      if (args.collection === 'translations') return { docs: translations }
      if (args.collection === 'pages') {
        // Page 2 exists but is only visible with overrideAccess. Page 9 does not exist at all.
        const visible = args.overrideAccess ? pages : pages.filter((p) => p.id === 1)
        const inList = (args.where as { id?: { in?: unknown[] } } | undefined)?.id?.in
        return { docs: inList ? visible.filter((p) => inList.map(String).includes(String(p.id))) : visible }
      }
      return { docs: [] }
    }),
    delete: vi.fn(async ({ collection, id }: { collection: string; id: unknown }) => {
      deletes.push({ collection, id })
      return {}
    }),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
  }
  return { engine, deletes }
}

const admin = { id: 1, email: 'admin@example.com' }

describe('parseClearInactiveBody', () => {
  it('accepts a whole-site clear and a per-item clear', () => {
    expect(parseClearInactiveBody({ action: 'clear-inactive', scope: 'all' })).toEqual({
      ok: true,
      value: { action: 'clear-inactive', scope: 'all', items: undefined, dryRun: false },
    })
    expect(parseClearInactiveBody({ action: 'clear-inactive', scope: 'items', items: ['collection:pages:1'], dryRun: true })).toMatchObject({
      ok: true,
      value: { scope: 'items', items: ['collection:pages:1'], dryRun: true },
    })
  })

  it('refuses a per-item clear with no items', () => {
    expect(parseClearInactiveBody({ action: 'clear-inactive', scope: 'items', items: [] }).ok).toBe(false)
  })

  it('maps item keys to source ids, and nothing else', () => {
    expect(sourceIdFromItemKey('collection:pages:12')).toBe('pages:12')
    expect(sourceIdFromItemKey('interface:interface')).toBeNull()
  })
})

describe('runClearInactive', () => {
  it('refuses anyone who is not an administrator', async () => {
    const { engine, deletes } = fixture()
    const result = await runClearInactive({
      engine,
      user: admin,
      isAdmin: false,
      canDelete: true,
      body: { action: 'clear-inactive', scope: 'all' },
    })
    expect(result.status).toBe(403)
    expect(deletes).toEqual([])
  })

  it('a dry run counts the orphans and deletes nothing', async () => {
    const { engine, deletes } = fixture()
    const result = await runClearInactive({
      engine,
      user: admin,
      isAdmin: true,
      canDelete: true,
      body: { action: 'clear-inactive', scope: 'all', dryRun: true },
    })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, count: 2, deleted: 0 })
    expect(deletes).toEqual([])
  })

  it('deletes only the orphaned rows: a missing field and a deleted page', async () => {
    const { engine, deletes } = fixture()
    const result = await runClearInactive({
      engine,
      user: admin,
      isAdmin: true,
      canDelete: true,
      body: { action: 'clear-inactive', scope: 'all' },
    })
    expect(result.status).toBe(200)
    expect(deletes.map((d) => d.id).sort()).toEqual([102, 103])
    expect(deletes.every((d) => d.collection === 'translations')).toBe(true)
  })

  it('never deletes an active or outdated approved translation, nor one on an unreadable page', async () => {
    const { engine, deletes } = fixture({
      translations: [
        // Outdated: the page's title changed from 'Home' to something else in the fixture below.
        { id: 201, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:1', fieldPath: 'title', value: 'Accueil', sourceText: 'Old title', status: 'approved' },
        // Unreadable page 2 (exists, not visible to this viewer): must be kept.
        { id: 202, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:2', fieldPath: 'title', value: 'Boutique', sourceText: 'Shop', status: 'approved' },
        { id: 203, locale: 'fr', sourceKind: 'collection', sourceId: 'pages:1', fieldPath: 'seo.metaTitle', value: 'SEO fr', sourceText: 'SEO', status: 'approved' },
      ],
    })
    const result = await runClearInactive({
      engine,
      user: admin,
      isAdmin: true,
      canDelete: true,
      body: { action: 'clear-inactive', scope: 'all' },
    })
    expect(result.status).toBe(200)
    expect(deletes).toEqual([])
  })

  it('a per-item clear touches only the listed page', async () => {
    const { engine, deletes } = fixture()
    await runClearInactive({
      engine,
      user: admin,
      isAdmin: true,
      canDelete: true,
      body: { action: 'clear-inactive', scope: 'items', items: ['collection:pages:1'] },
    })
    expect(deletes.map((d) => d.id)).toEqual([102])
  })
})
