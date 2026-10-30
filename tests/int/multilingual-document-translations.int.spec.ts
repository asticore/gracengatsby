// @vitest-environment node
// The visual builder's Translate mode reads one document's translations through this shaping function.
// Pure: no engine, no database. The rules it leans on are tested in translation workflow specs.
import { describe, expect, it } from 'vitest'

import { buildDocumentTranslations } from '@/features/multilingual/documentTranslations'
import type { MultilingualSettings } from '@/features/multilingual/settings'
import type { TranslationRow } from '@/features/multilingual/store'
import { TRANSLATABLE_COLLECTIONS } from '@/features/multilingual/translatableFields'

const settings = {
  defaultLocale: 'en-AU',
  activeLocales: ['en-AU', 'fr', 'de'],
  requireReview: true,
  adminsBypassReview: true,
  translationRules: { fr: { translators: [7], reviewers: [9] } },
} as Pick<MultilingualSettings, 'defaultLocale' | 'activeLocales' | 'requireReview' | 'adminsBypassReview' | 'translationRules'>

const doc = {
  id: 4,
  title: 'About us',
  seo: { metaTitle: 'About', metaDescription: 'Who we are' },
  content: { root: { children: [{ type: 'paragraph', children: [{ text: 'Rich body' }] }] } },
}

const row = (overrides: Partial<TranslationRow>): TranslationRow => ({
  id: 1,
  locale: 'fr',
  sourceKind: 'collection',
  sourceId: 'pages:4',
  fieldPath: 'title',
  value: 'À propos',
  sourceText: 'About us',
  status: 'approved',
  assignedTo: [],
  machineProvider: null,
  reviewedBy: 9,
  reviewedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('translatable fields', () => {
  it('names the SEO fields where the Pages collection stores them', () => {
    const pages = TRANSLATABLE_COLLECTIONS.find((entry) => entry.slug === 'pages')
    expect(pages?.fields.map((field) => field.path)).toEqual(['title', 'slug', 'seo.metaTitle', 'seo.metaDescription'])
  })
})

describe('buildDocumentTranslations', () => {
  it('returns null for a collection with no translatable fields', () => {
    expect(
      buildDocumentTranslations({ collection: 'media', documentId: 1, doc: {}, settings, rows: [], viewer: { id: 9, isAdmin: false } }),
    ).toBeNull()
  })

  it('lists only target languages, in configured order', () => {
    const out = buildDocumentTranslations({ collection: 'pages', documentId: 4, doc, settings, rows: [], viewer: { id: 9, isAdmin: false } })
    expect(out?.sourceId).toBe('pages:4')
    expect(out?.locales.map((group) => group.locale)).toEqual(['fr', 'de'])
  })

  it('reads the SEO source text from the stored seo group', () => {
    const out = buildDocumentTranslations({ collection: 'pages', documentId: 4, doc, settings, rows: [], viewer: { id: 9, isAdmin: false } })
    const fr = out?.locales.find((group) => group.locale === 'fr')
    expect(fr?.fields.find((field) => field.fieldPath === 'seo.metaDescription')?.sourceText).toBe('Who we are')
  })

  it('counts progress over plain fields only and marks rich text read-only', () => {
    const out = buildDocumentTranslations({
      collection: 'pages',
      documentId: 4,
      doc,
      settings,
      rows: [row({ fieldPath: 'title' }), row({ id: 2, fieldPath: 'seo.metaTitle', value: 'À propos SEO', status: 'needs_review' })],
      viewer: { id: 9, isAdmin: false },
    })
    const fr = out!.locales.find((group) => group.locale === 'fr')!
    expect(fr.approved).toBe(1)
    expect(fr.total).toBe(3)
    const title = fr.fields.find((field) => field.fieldPath === 'title')!
    expect(title).toMatchObject({ value: 'À propos', rowId: 1, status: 'approved' })
  })

  it('marks a translation stale when the source text has moved since it was saved', () => {
    const out = buildDocumentTranslations({
      collection: 'pages',
      documentId: 4,
      doc: { ...doc, title: 'About our team' },
      settings,
      rows: [row({ fieldPath: 'title' })],
      viewer: { id: 9, isAdmin: false },
    })
    const title = out!.locales.find((group) => group.locale === 'fr')!.fields.find((field) => field.fieldPath === 'title')!
    expect(title.status).toBe('needs_review')
  })

  it('uses the language rules for assignees and the reviewer list for approval', () => {
    const rows = [row({ fieldPath: 'title', status: 'needs_review', value: 'À propos' })]
    const asReviewer = buildDocumentTranslations({ collection: 'pages', documentId: 4, doc, settings, rows, viewer: { id: 9, isAdmin: false } })
    const asTranslator = buildDocumentTranslations({ collection: 'pages', documentId: 4, doc, settings, rows, viewer: { id: 7, isAdmin: false } })
    const reviewerTitle = asReviewer!.locales[0].fields.find((field) => field.fieldPath === 'title')!
    const translatorTitle = asTranslator!.locales[0].fields.find((field) => field.fieldPath === 'title')!
    expect(reviewerTitle.assignees).toEqual([9])
    expect(reviewerTitle.canApprove).toBe(true)
    expect(translatorTitle.canApprove).toBe(false)
  })

  it('lists rich text per text node, grouped under the field, and editable like any text', () => {
    const out = buildDocumentTranslations({
      collection: 'posts',
      documentId: 2,
      doc: { id: 2, title: 'Post', content: { root: { children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Body' }] }] } } },
      settings,
      rows: [],
      viewer: { id: 9, isAdmin: true },
    })
    const body = out!.locales[0].fields.find((field) => field.fieldPath === 'content#0.0')!
    expect(body).toMatchObject({ richText: false, sourceText: 'Body', group: { key: 'content', blockLabel: 'Body' } })
    expect(body.canApprove).toBe(true)
    // Title and the one text node.
    expect(out!.locales[0].total).toBe(2)
  })
})
