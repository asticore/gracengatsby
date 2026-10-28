// @vitest-environment node
// One row per document: aggregation, active / outdated / inactive classification, orphan
// selection for "Clear inactive", the deep-link target per language, and the columns.
// Pure - no engine. The delete path is covered in multilingual-clear-inactive.int.spec.ts.
import { describe, expect, it } from 'vitest'

import {
  builderHasSurface,
  buildDocumentRows,
  classifyStoredRow,
  classifyTranslation,
  documentColumns,
  findInactiveRows,
  publicPathFor,
  translateTarget,
  unconfirmedSourceIds,
  type LiveDocument,
  type TranslationCatalogue,
} from '@/features/multilingual/documentRows'
import type { TranslationRow } from '@/features/multilingual/store'
import type { OverviewItemInput } from '@/features/multilingual/translationOverview'
import type { TranslationRules } from '@/features/multilingual/translationStatus'

const RULES: TranslationRules = { fr: { translators: [2, 3], reviewers: [4] } }

const doc = (id: string, fields: Record<string, string>, extra: Partial<LiveDocument> = {}): LiveDocument => ({
  collection: 'pages',
  documentId: id,
  sourceId: `pages:${id}`,
  title: `Page ${id}`,
  slug: `page-${id}`,
  updatedAt: '2026-10-01T00:00:00.000Z',
  fields: new Map(Object.entries(fields)),
  ...extra,
})

const row = (over: Partial<TranslationRow> & Pick<TranslationRow, 'sourceId' | 'fieldPath'>): TranslationRow => ({
  id: `${over.sourceId}:${over.fieldPath}:${over.locale ?? 'fr'}`,
  locale: 'fr',
  sourceKind: 'collection',
  value: 'valeur',
  sourceText: 'source',
  status: 'approved',
  assignedTo: [],
  machineProvider: null,
  reviewedBy: null,
  reviewedAt: null,
  ...over,
})

const item = (id: string, fields: Array<[string, string]>): OverviewItemInput => ({
  sourceKind: 'collection',
  sourceId: `pages:${id}`,
  type: 'pages',
  typeLabel: 'Pages',
  title: `Page ${id}`,
  updatedAt: '2026-10-01T00:00:00.000Z',
  editHref: `/admin/collections/pages/${id}`,
  fields: fields.map(([fieldPath, sourceText]) => ({ fieldPath, label: fieldPath, sourceText })),
})

const documentHref = (collection: string, id: string) => `?item=${encodeURIComponent(`collection:${collection}:${id}`)}`

describe('classifyTranslation', () => {
  const live = doc('1', { title: 'Home', 'seo.metaTitle': 'SEO', 'seo.metaDescription': '' })

  it('is active when the field exists and its source text is unchanged', () => {
    expect(classifyTranslation({ fieldPath: 'title', sourceText: 'Home' }, live, false)).toBe('active')
  })

  it('is outdated when the field exists but its source text has changed', () => {
    expect(classifyTranslation({ fieldPath: 'title', sourceText: 'Old home' }, live, false)).toBe('outdated')
  })

  it('is active when the row has no snapshot to compare against', () => {
    expect(classifyTranslation({ fieldPath: 'title', sourceText: null }, live, false)).toBe('active')
  })

  it('is inactive when the field or block no longer exists on the document', () => {
    expect(classifyTranslation({ fieldPath: 'blocks.9.text', sourceText: 'x' }, live, false)).toBe('inactive')
  })

  it('treats an empty field as existing (it is in the document, just blank)', () => {
    expect(classifyTranslation({ fieldPath: 'seo.metaDescription', sourceText: '' }, live, false)).toBe('active')
  })

  it('is inactive when the document is confirmed deleted, and unknown when it is only not loaded', () => {
    expect(classifyTranslation({ fieldPath: 'title', sourceText: 'Home' }, undefined, true)).toBe('inactive')
    expect(classifyTranslation({ fieldPath: 'title', sourceText: 'Home' }, undefined, false)).toBe('unknown')
  })
})

describe('classifyStoredRow', () => {
  const catalogue: TranslationCatalogue = {
    documents: new Map([['pages:1', doc('1', { title: 'Home' })]]),
    confirmedMissing: new Set(['pages:9']),
  }

  it('never calls interface or global rows inactive', () => {
    const interfaceRow = row({ sourceKind: 'interface', sourceId: 'interface', fieldPath: 'nav.home' })
    expect(classifyStoredRow(interfaceRow, catalogue)).toBe('unknown')
  })

  it('never calls rows of an unknown collection inactive', () => {
    expect(classifyStoredRow(row({ sourceId: 'legacy-widgets:3', fieldPath: 'title' }), catalogue)).toBe('unknown')
  })

  it('uses the confirmed-missing set for documents that are not loaded', () => {
    expect(classifyStoredRow(row({ sourceId: 'pages:9', fieldPath: 'title', sourceText: 'x' }), catalogue)).toBe('inactive')
    expect(classifyStoredRow(row({ sourceId: 'pages:8', fieldPath: 'title', sourceText: 'x' }), catalogue)).toBe('unknown')
  })
})

describe('findInactiveRows (what Clear inactive may delete)', () => {
  const catalogue: TranslationCatalogue = {
    documents: new Map([
      ['pages:1', doc('1', { title: 'Home', 'seo.metaTitle': 'Changed' })],
      ['pages:2', doc('2', { title: 'Shop' })],
    ]),
    confirmedMissing: new Set(['pages:9']),
  }
  const stored: TranslationRow[] = [
    row({ id: 'active', sourceId: 'pages:1', fieldPath: 'title', sourceText: 'Home', status: 'approved' }),
    row({ id: 'outdated', sourceId: 'pages:1', fieldPath: 'seo.metaTitle', sourceText: 'SEO', status: 'approved' }),
    row({ id: 'gone-field', sourceId: 'pages:1', fieldPath: 'blocks.4.text', sourceText: 'x', status: 'approved' }),
    row({ id: 'gone-doc', sourceId: 'pages:9', fieldPath: 'title', sourceText: 'Lost', status: 'approved' }),
    row({ id: 'unreadable', sourceId: 'pages:2', fieldPath: 'title', sourceText: 'Shop', status: 'approved' }),
    row({ id: 'interface', sourceKind: 'interface', sourceId: 'interface', fieldPath: 'nav.home', status: 'approved' }),
  ]

  it('selects only the orphaned rows', () => {
    expect(findInactiveRows(stored, catalogue).map((r) => r.id)).toEqual(['gone-field', 'gone-doc'])
  })

  it('never selects an active or outdated row, even when it is approved', () => {
    const selected = findInactiveRows(stored, catalogue).map((r) => r.id)
    expect(selected).not.toContain('active')
    expect(selected).not.toContain('outdated')
  })

  it('never selects a row whose document is merely not loaded (unreadable is not deleted)', () => {
    expect(findInactiveRows(stored, catalogue).map((r) => r.id)).not.toContain('unreadable')
  })

  it('narrows to the given source ids for a per-item clear', () => {
    expect(findInactiveRows(stored, catalogue, new Set(['pages:9'])).map((r) => r.id)).toEqual(['gone-doc'])
  })

  it('lists the source ids the clear action must confirm against the database', () => {
    expect(unconfirmedSourceIds(stored, catalogue).sort()).toEqual(['pages:9'])
  })
})

describe('buildDocumentRows (one row per page, rollup per language)', () => {
  const items = [item('1', [['title', 'Home'], ['seo.metaTitle', 'SEO']]), item('2', [['title', 'Shop']])]
  const catalogue: TranslationCatalogue = {
    documents: new Map([
      ['pages:1', doc('1', { title: 'Home', 'seo.metaTitle': 'SEO' })],
      ['pages:2', doc('2', { title: 'Shop' })],
    ]),
    confirmedMissing: new Set(),
  }
  const stored: TranslationRow[] = [
    row({ sourceId: 'pages:1', fieldPath: 'title', sourceText: 'Home', status: 'approved', value: 'Accueil' }),
    row({ sourceId: 'pages:1', fieldPath: 'seo.metaTitle', sourceText: 'SEO', status: 'machine_draft', value: 'SEO fr' }),
    row({ sourceId: 'pages:1', fieldPath: 'gone', sourceText: 'x', status: 'approved', value: 'orphan' }),
    row({ sourceId: 'pages:2', fieldPath: 'title', sourceText: 'Shop', status: 'approved', value: 'Boutique' }),
  ]

  const rows = buildDocumentRows({ items, stored, targetLocales: ['fr', 'de'], rules: RULES, catalogue, documentHref })

  it('returns one row per document, not per field', () => {
    expect(rows.map((r) => r.key)).toEqual(['collection:pages:1', 'collection:pages:2'])
  })

  it('rolls up approved over live fields per language (for example FR 1/2)', () => {
    const page1 = rows[0]!
    const fr = page1.cells.find((cell) => cell.locale === 'fr')!
    expect(fr.total).toBe(2)
    expect(fr.approved).toBe(1)
    expect(fr.status).toBe('machine_draft')
    expect(page1.cells.find((cell) => cell.locale === 'de')!.status).toBe('missing')
  })

  it('counts active, outdated and inactive translations with text', () => {
    expect(rows[0]!.counts).toEqual({ active: 2, outdated: 0, inactive: 1 })
    expect(rows[0]!.inactive).toEqual([
      expect.objectContaining({ locale: 'fr', fieldPath: 'gone', reason: 'field-removed', value: 'orphan' }),
    ])
  })

  it('counts a changed source as outdated and keeps it out of inactive', () => {
    const changed: TranslationCatalogue = {
      documents: new Map([['pages:1', doc('1', { title: 'Home 2026', 'seo.metaTitle': 'SEO' })]]),
      confirmedMissing: new Set(),
    }
    const [page] = buildDocumentRows({ items: [items[0]!], stored, targetLocales: ['fr'], rules: RULES, catalogue: changed, documentHref })
    expect(page!.counts.outdated).toBe(1)
    expect(page!.cells[0]!.counts.outdated).toBe(1)
  })

  it('opens each language in the builder when the type has one, the editor otherwise', () => {
    expect(rows[0]!.cells[0]!.href).toBe('/admin/visual-editor/collection/pages/1?lang=fr&translate=1')
    expect(rows[0]!.mode).toBe('builder')
    const events = buildDocumentRows({
      items: [{ ...items[0]!, sourceId: 'events:5', type: 'events', typeLabel: 'Events' }],
      stored: [],
      targetLocales: ['fr'],
      rules: RULES,
      catalogue: { documents: new Map(), confirmedMissing: new Set() },
      documentHref,
    })
    expect(events[0]!.mode).toBe('editor')
    expect(events[0]!.cells[0]!.href).toBe(documentHref('events', '5'))
  })

  it('carries the public URL and the last source change time', () => {
    expect(rows[0]!.url).toBe('/page-1')
    expect(rows[0]!.lastSourceChange).toBe('2026-10-01T00:00:00.000Z')
  })
})

describe('deep link targets and URLs', () => {
  it('knows which collections have a builder (formMode forms and unknown types do not)', () => {
    expect(builderHasSurface('pages')).toBe(true)
    expect(builderHasSurface('posts')).toBe(true)
    expect(builderHasSurface('events')).toBe(false)
    expect(builderHasSurface('faqs')).toBe(false)
  })

  it('falls back to the document editor for a type without a builder', () => {
    expect(translateTarget({ collection: 'faqs', documentId: '3', locale: 'fr', editorHref: '?item=x' })).toEqual({
      href: '?item=x',
      mode: 'editor',
    })
  })

  it('builds public paths per type', () => {
    expect(publicPathFor('pages', 'about')).toBe('/about')
    expect(publicPathFor('posts', 'hello')).toBe('/blog/hello')
    expect(publicPathFor('products', 'mug')).toBe('/shop/mug')
    expect(publicPathFor('events', 'gala')).toBe('/events/gala')
    expect(publicPathFor('faqs', null)).toBe('/faq')
    expect(publicPathFor('pages', null)).toBeNull()
  })
})

describe('documentColumns', () => {
  it('lists title, type, URL, one language column each, inactive and last source change, with the filters', () => {
    const columns = documentColumns({ targetLocales: ['fr'], localeLabel: (code) => code.toUpperCase() })
    const names = columns.map((column) => column.name)
    expect(names).toEqual(expect.arrayContaining(['title', 'type', 'url', 'lang:fr', 'inactive', 'updatedAt', 'assignee', 'locale', 'status']))
    expect(names).not.toContain('lang:interface')
    expect(columns.find((column) => column.name === 'type')!.options!.map((option) => option.value)).toEqual(
      expect.arrayContaining(['pages', 'posts', 'products', 'events', 'faqs']),
    )
    expect(columns.find((column) => column.name === 'type')!.options!.map((option) => option.value)).not.toContain('interface')
  })
})
