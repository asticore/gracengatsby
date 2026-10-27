import { describe, it, expect } from 'vitest'
import { buildAuditRow, summariseAuditRows, type AuditRow } from '@/features/seo/audit'
import { filterAuditRows, sortAuditRows, DEFAULT_AUDIT_FILTERS } from '@/features/seo/auditFilters'
import { loadAuditRows, AUDIT_LIMIT_PER_COLLECTION, type AuditFindEngine } from '@/features/seo/auditLoader'

const page = {
  id: 7,
  title: 'Running shoes guide',
  slug: 'running-shoes-guide',
  seo: { metaTitle: 'Running shoes guide for every runner', metaDescription: '', focusKeyphrase: 'running shoes', noIndex: true },
}

describe('buildAuditRow', () => {
  it('reads the title, slug, edit link and SEO flags from the document', () => {
    const row = buildAuditRow(page, 'pages')
    expect(row.collection).toBe('pages')
    expect(row.id).toBe(7)
    expect(row.title).toBe('Running shoes guide')
    expect(row.slug).toBe('running-shoes-guide')
    expect(row.editHref).toBe(`/admin/content/pages/7`)
    expect(row.hasKeyphrase).toBe(true)
    expect(row.hasMetaDescription).toBe(false)
    expect(row.noIndex).toBe(true)
  })

  it('lists the failing checks as problems', () => {
    const row = buildAuditRow(page, 'pages')
    expect(row.problems).toContain('The focus keyphrase does not appear in the meta description.')
  })

  it('reports a missing focus keyphrase and asks for one', () => {
    const row = buildAuditRow({ id: 2, title: 'About us', slug: 'about', seo: {} }, 'pages')
    expect(row.hasKeyphrase).toBe(false)
    expect(row.noIndex).toBe(false)
    expect(row.problems).toContain('Set a focus keyphrase so the checks can see how well the page matches it.')
  })

  it('falls back to the name field for products and events', () => {
    const row = buildAuditRow({ id: 9, name: 'Trail shoe', slug: 'trail-shoe' }, 'products')
    expect(row.title).toBe('Trail shoe')
    expect(row.editHref).toBe(`/admin/shop/products/9`)
  })

  it('treats a non-object seo group as empty', () => {
    const row = buildAuditRow({ id: 3, title: 'Plain', slug: 'plain', seo: 'oops' }, 'posts')
    expect(row.hasKeyphrase).toBe(false)
    expect(row.noIndex).toBe(false)
  })
})

const rowOf = (over: Partial<AuditRow>): AuditRow => ({
  collection: 'pages',
  id: 1,
  title: 'A',
  slug: 'a',
  editHref: `/admin/content/pages/1`,
  seoScore: 'good',
  readabilityScore: 'good',
  hasKeyphrase: true,
  hasMetaDescription: true,
  problems: [],
  noIndex: false,
  ...over,
})

describe('summariseAuditRows', () => {
  it('counts scores and the missing-field flags', () => {
    const rows = [
      rowOf({ seoScore: 'good' }),
      rowOf({ id: 2, seoScore: 'ok', hasKeyphrase: false }),
      rowOf({ id: 3, seoScore: 'bad', hasMetaDescription: false, noIndex: true }),
      rowOf({ id: 4, seoScore: 'bad', hasKeyphrase: false, hasMetaDescription: false }),
    ]
    expect(summariseAuditRows(rows)).toEqual({
      total: 4,
      good: 1,
      ok: 1,
      bad: 2,
      missingKeyphrase: 2,
      missingMetaDescription: 2,
      noIndex: 1,
    })
  })

  it('returns zeros for an empty list', () => {
    expect(summariseAuditRows([])).toEqual({ total: 0, good: 0, ok: 0, bad: 0, missingKeyphrase: 0, missingMetaDescription: 0, noIndex: 0 })
  })
})

describe('filterAuditRows and sortAuditRows', () => {
  const rows = [
    rowOf({ id: 1, title: 'Zebra', seoScore: 'good' }),
    rowOf({ id: 2, title: 'Mango', seoScore: 'bad', hasKeyphrase: false, problems: ['Add a meta description.'] }),
    rowOf({ id: 3, collection: 'posts', title: 'Apple', seoScore: 'ok' }),
  ]

  it('filters by collection, score, missing keyphrase and problem text', () => {
    expect(filterAuditRows(rows, { ...DEFAULT_AUDIT_FILTERS, collection: 'posts' }).map((r) => r.id)).toEqual([3])
    expect(filterAuditRows(rows, { ...DEFAULT_AUDIT_FILTERS, score: 'bad' }).map((r) => r.id)).toEqual([2])
    expect(filterAuditRows(rows, { ...DEFAULT_AUDIT_FILTERS, missingKeyphrase: true }).map((r) => r.id)).toEqual([2])
    expect(filterAuditRows(rows, { ...DEFAULT_AUDIT_FILTERS, problemText: 'META description' }).map((r) => r.id)).toEqual([2])
  })

  it('sorts worst first by default and by title on request', () => {
    expect(sortAuditRows(rows, 'worst').map((r) => r.id)).toEqual([2, 3, 1])
    expect(sortAuditRows(rows, 'best').map((r) => r.id)).toEqual([1, 3, 2])
    expect(sortAuditRows(rows, 'title').map((r) => r.title)).toEqual(['Apple', 'Mango', 'Zebra'])
  })
})

describe('loadAuditRows', () => {
  it('reads published documents only, skips trashed ones and passes the published filter', async () => {
    const calls: { collection: string; where?: Record<string, unknown>; limit?: number }[] = []
    const engine: AuditFindEngine = {
      async find(args) {
        calls.push({ collection: args.collection, where: args.where, limit: args.limit })
        if (args.collection !== 'pages') return { docs: [] }
        return {
          docs: [
            { id: 1, title: 'Live', slug: 'live', seo: {} },
            { id: 2, title: 'Gone', slug: 'gone', seo: {}, trashedAt: '2026-01-01T00:00:00.000Z' },
          ],
        }
      },
    }
    const rows = await loadAuditRows(engine, ['pages', 'events'])
    expect(rows.map((r) => r.id)).toEqual([1])
    expect(calls.map((c) => c.collection)).toEqual(['pages', 'events'])
    expect(calls[0]?.where).toEqual({ _status: { equals: 'published' } })
    expect(calls[0]?.limit).toBe(AUDIT_LIMIT_PER_COLLECTION)
  })
})
