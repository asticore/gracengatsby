// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { collectionGroup, adminCollectionPath } from '@/admin/adminPaths'
import { NAV_STRUCTURE, HIDDEN_FROM_NAV } from '@/components/admin/nav/navStructure'
import { buildHubRows, filterHubRows, pageHubRows, sortHubRows, HUB_COLUMNS, type HubSourceDoc } from '@/features/templatesHub/rows'

const BLOCKS: unknown[] = [{ blockType: 'section' }]

const site = (over: Partial<HubSourceDoc> & { id: number; kind: string }): HubSourceDoc => ({
  name: `Site ${over.id}`,
  enabled: true,
  priority: 10,
  conditions: [],
  blocks: BLOCKS,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
})

const fixture = () =>
  buildHubRows({
    siteTemplates: [
      site({ id: 1, kind: 'header', name: 'Main header', updatedAt: '2026-10-03T00:00:00.000Z' }),
      site({ id: 2, kind: 'single-post', name: 'Post layout', enabled: false, priority: 50, updatedAt: '2026-10-02T00:00:00.000Z' }),
      site({ id: 3, kind: 'archive-tag', name: 'Tag page', conditions: [[{ param: 'postTag', operator: 'equals', value: 'news' }]], priority: 0, updatedAt: null }),
    ],
    pageTemplates: [{ id: 7, name: 'Landing', updatedAt: '2026-10-05T00:00:00.000Z' }],
    reusableSections: [{ id: 9, name: 'Footer strip', updatedAt: '2026-09-01T00:00:00.000Z' }],
  })

describe('templates hub rows', () => {
  it('builds one row per template across the three collections', () => {
    const rows = fixture()
    expect(rows).toHaveLength(5)
    expect(rows.map((r) => r.collection)).toEqual(['site-templates', 'site-templates', 'site-templates', 'page-templates', 'reusable-sections'])
  })

  it('labels site types by kind and page templates and sections by their own type', () => {
    const byKey = Object.fromEntries(fixture().map((r) => [r.key, r]))
    expect(byKey['site-templates:1'].typeLabel).toBe('Header')
    expect(byKey['site-templates:2'].typeLabel).toBe('Single post')
    expect(byKey['site-templates:3'].typeLabel).toBe('Tag archive')
    expect(byKey['page-templates:7'].typeLabel).toBe('Page template')
    expect(byKey['reusable-sections:9'].typeLabel).toBe('Reusable section')
  })

  it('shows on/off for site templates and "Available" for the other two kinds', () => {
    const byKey = Object.fromEntries(fixture().map((r) => [r.key, r]))
    expect(byKey['site-templates:1']).toMatchObject({ status: 'on', statusLabel: 'On', toggleable: true })
    expect(byKey['site-templates:2']).toMatchObject({ status: 'off', statusLabel: 'Off' })
    expect(byKey['page-templates:7']).toMatchObject({ status: 'available', statusLabel: 'Available', toggleable: false, priority: null })
  })

  it('says where each kind applies: the summary for site templates, fixed text for page templates and sections', () => {
    const byKey = Object.fromEntries(fixture().map((r) => [r.key, r]))
    expect(byKey['site-templates:1'].where).toBe('Everywhere for its type.')
    expect(byKey['site-templates:3'].where).toBe('When post tag is "news".')
    expect(byKey['page-templates:7'].where).toBe('Starter for new pages')
    expect(byKey['reusable-sections:9'].where).toBe('Inserted manually')
  })

  it('links to the item edit screen, the visual builder where one exists, and a public preview where a page exists', () => {
    const byKey = Object.fromEntries(fixture().map((r) => [r.key, r]))
    expect(byKey['site-templates:1']).toMatchObject({
      editHref: adminCollectionPath('site-templates') + '/1',
      visualHref: '/admin/visual-editor/collection/site-templates/1',
      previewHref: '/',
    })
    expect(byKey['site-templates:2'].previewHref).toBeNull()
    expect(byKey['page-templates:7'].visualHref).toBe('/admin/visual-editor/collection/page-templates/7')
    expect(byKey['reusable-sections:9']).toMatchObject({
      visualHref: '/admin/visual-editor/collection/reusable-sections/9',
      editHref: adminCollectionPath('reusable-sections') + '/9',
    })
  })

  it('filters by type, by label, and by status', () => {
    const rows = fixture()
    const types = (list: ReturnType<typeof fixture>) => list.map((r) => r.key).sort()
    expect(types(filterHubRows(rows, [{ field: 'type', op: 'equals', value: 'header' }], ''))).toEqual(['site-templates:1'])
    expect(types(filterHubRows(rows, [{ field: 'type', op: 'equals', value: 'Reusable section' }], ''))).toEqual(['reusable-sections:9'])
    // A collection name is not a type, so nothing matches it and nothing is excluded.
    expect(filterHubRows(rows, [{ field: 'type', op: 'not_equals', value: 'site-templates' }], '')).toHaveLength(5)
    expect(types(filterHubRows(rows, [{ field: 'status', op: 'equals', value: 'off' }], ''))).toEqual(['site-templates:2'])
    expect(types(filterHubRows(rows, [{ field: 'status', op: 'equals', value: 'available' }], ''))).toEqual(['page-templates:7', 'reusable-sections:9'])
  })

  it('searches names, type labels and where text, case-insensitively, and ignores unknown filters', () => {
    const rows = fixture()
    expect(filterHubRows(rows, [], 'FOOTER').map((r) => r.key)).toEqual(['reusable-sections:9'])
    expect(filterHubRows(rows, [], 'tag archive').map((r) => r.key)).toEqual(['site-templates:3'])
    expect(filterHubRows(rows, [], 'postTag')).toHaveLength(0)
    expect(filterHubRows(rows, [{ field: 'name', op: 'equals', value: 'nope' }], '')).toHaveLength(5)
  })

  it('sorts by the default (most recently updated first, undated last) and by any sortable column', () => {
    const rows = fixture()
    expect(sortHubRows(rows, '-updatedAt').map((r) => r.id)).toEqual([7, 1, 2, 9, 3])
    expect(sortHubRows(rows, 'name').map((r) => r.name)).toEqual(['Footer strip', 'Landing', 'Main header', 'Post layout', 'Tag page'])
    // Priority: highest first among templates that have one; page templates and sections (no priority) last.
    const byPriority = sortHubRows(rows, '-priority').map((r) => r.id)
    expect(byPriority.slice(0, 3)).toEqual([2, 1, 3])
    expect(byPriority.slice(3).sort()).toEqual([7, 9])
  })

  it('falls back to the default sort for unknown sort fields', () => {
    const rows = fixture()
    expect(sortHubRows(rows, 'bogus').map((r) => r.key)).toEqual(sortHubRows(rows, '-updatedAt').map((r) => r.key))
  })

  it('pages rows and clamps the page into range', () => {
    const rows = fixture()
    const first = pageHubRows(rows, 1, 2)
    expect(first.rows).toHaveLength(2)
    expect(first.totalPages).toBe(3)
    expect(pageHubRows(rows, 99, 2)).toMatchObject({ page: 3, rows: rows.slice(4) })
    expect(pageHubRows([], 1, 25)).toMatchObject({ totalPages: 1, rows: [] })
  })

  it('offers the column picker the same columns as the list', () => {
    expect(HUB_COLUMNS.map((c) => c.name)).toEqual(['name', 'type', 'status', 'where', 'whereUsed', 'priority', 'updatedAt'])
    expect(HUB_COLUMNS.filter((c) => c.filterable).map((c) => c.name)).toEqual(['type', 'status'])
  })
})

describe('templates hub navigation', () => {
  const contentLabels = () => NAV_STRUCTURE.find((g) => g.label === 'Content')?.entities ?? []

  it('shows one Templates entry in the Content group in place of the three collections', () => {
    const entries = contentLabels()
    expect(entries.find((e) => e.slug === 'templates')).toEqual({ slug: 'templates', type: 'view', href: '/templates', label: 'Templates' })
    for (const slug of ['site-templates', 'page-templates', 'reusable-sections']) {
      const ref = entries.find((e) => e.slug === slug)
      expect(ref?.hidden, `${slug} is hidden from the sidebar`).toBe(true)
      expect(HIDDEN_FROM_NAV.has(slug)).toBe(true)
    }
  })

  it('keeps the three collections in their group so their URLs stay under /admin/content', () => {
    expect(collectionGroup('site-templates')).toBe('content')
    expect(collectionGroup('page-templates')).toBe('content')
    expect(collectionGroup('reusable-sections')).toBe('content')
    expect(adminCollectionPath('site-templates')).toBe('/admin/content/site-templates')
  })
})
