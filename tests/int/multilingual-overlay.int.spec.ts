import { describe, expect, it } from 'vitest'

import { localisedHref, sourceIdFor, type MultilingualSettings, type TranslationRow } from '@/features/multilingual'
import { lookupFromRows, overlayDocument } from '@/features/multilingual/overlay'
import { publishableLocalesForDocument, publishIndex } from '@/features/multilingual/availability'
import { isTranslationPublishable } from '@/features/multilingual/translationStatus'

type RowOverrides = Partial<Pick<TranslationRow, 'status' | 'sourceText' | 'locale' | 'reviewedBy'>>

const row = (sourceId: string, fieldPath: string, value: string | null, extra: RowOverrides = {}): TranslationRow => ({
  id: `${sourceId}:${fieldPath}`,
  locale: 'fr',
  sourceKind: 'collection',
  sourceId,
  fieldPath,
  value,
  sourceText: null,
  status: null,
  assignedTo: [],
  machineProvider: null,
  reviewedBy: null,
  reviewedAt: null,
  ...extra,
})

const review = { requireReview: true } as const
const noReview = { requireReview: false } as const

const lookupFor = (rows: TranslationRow[], locale = 'fr', settings: { requireReview: boolean } = noReview) =>
  lookupFromRows(locale, rows, settings)

const page = {
  id: 7,
  title: 'About us',
  seo: { metaTitle: 'About | Site', metaDescription: 'Who we are' },
  slug: 'about',
  layout: [{ blockType: 'hero', heading: 'Hello' }],
}

describe('overlayDocument', () => {
  it('overlays translated plain-string fields and leaves everything else alone', () => {
    const rows = [row(sourceIdFor('pages', 7), 'title', 'À propos'), row(sourceIdFor('pages', 7), 'seo.metaTitle', 'À propos | Site')]
    const translated = overlayDocument(page, 'pages', 7, (s, p) => {
      const hit = rows.find((r) => r.sourceId === s && r.fieldPath === p)
      return hit?.value ?? null
    }, true)
    expect(translated.title).toBe('À propos')
    expect(translated.seo.metaTitle).toBe('À propos | Site')
    // Not translated: no row for meta.description, and slug/layout are not in the field list.
    expect(translated.seo.metaDescription).toBe('Who we are')
    expect(translated.slug).toBe('about')
    expect(translated.layout).toBe(page.layout)
    // The source document is not mutated.
    expect(page.title).toBe('About us')
  })

  it('falls back to the source text per field when fallbackToDefault is true', () => {
    const out = overlayDocument(page, 'pages', 7, () => null, true)
    expect(out).toEqual(page)
  })

  it('leaves a field empty when there is no translation and fallbackToDefault is false', () => {
    const out = overlayDocument(page, 'pages', 7, () => null, false)
    expect(out.title).toBe('')
    expect(out.seo.metaTitle).toBe('')
    expect(out.seo.metaDescription).toBe('')
    expect(out.slug).toBe('about')
  })

  it('treats a blank translation as missing', () => {
    const rows = [row(sourceIdFor('pages', 7), 'title', '   ')]
    const withFallback = overlayDocument(page, 'pages', 7, lookupFor(rows), true)
    expect(withFallback.title).toBe('About us')
    const without = overlayDocument(page, 'pages', 7, lookupFor(rows), false)
    expect(without.title).toBe('')
  })

  it('never overlays rich text, even when a row exists for it', () => {
    const post = { id: 3, title: 'Hi', content: { root: { children: [{ type: 'paragraph', text: 'x' }] } } }
    const rows = [row(sourceIdFor('posts', 3), 'content', 'texte')]
    const out = overlayDocument(post, 'posts', 3, lookupFor(rows), false)
    expect(out.content).toBe(post.content)
  })

  it('skips fields whose source is not a string', () => {
    const product: { id: number; title?: string; meta: null } = { id: 9, title: undefined, meta: null }
    const out = overlayDocument(product, 'products', 9, () => 'x', true)
    expect(out.title).toBeUndefined()
    expect(out.meta).toBeNull()
  })

  it('returns the input unchanged for a collection with no translatable fields', () => {
    const doc = { id: 1, title: 'Keep' }
    expect(overlayDocument(doc, 'unknown-collection', 1, () => 'x', true)).toBe(doc)
  })

  it('overlays event location text and FAQ questions', () => {
    const event = { id: 2, title: 'Gala', location: { venueName: 'Hall', address: '1 St' } }
    const rows = [row(sourceIdFor('events', 2), 'location.venueName', 'Salle'), row(sourceIdFor('events', 2), 'location.address', '1 rue')]
    const out = overlayDocument(event, 'events', 2, lookupFor(rows), true)
    expect(out.location).toEqual({ venueName: 'Salle', address: '1 rue' })
    const faq = { id: 5, question: 'Why?', answer: 'Because' }
    const faqOut = overlayDocument(faq, 'faqs', 5, lookupFor([row(sourceIdFor('faqs', 5), 'question', 'Pourquoi ?')]), true)
    expect(faqOut.question).toBe('Pourquoi ?')
    expect(faqOut.answer).toBe('Because')
  })
})

describe('publish rule on the overlay', () => {
  const pageId = sourceIdFor('pages', 7)

  it('with review off, shows machine drafts and rows with no status, as before', () => {
    const rows = [row(pageId, 'title', 'Brouillon', { status: 'machine_draft' }), row(pageId, 'seo.metaTitle', 'Legacy', { status: null })]
    const out = overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', noReview), true)
    expect(out.title).toBe('Brouillon')
    expect(out.seo.metaTitle).toBe('Legacy')
  })

  it('with review off, a stale translation is still shown', () => {
    const rows = [row(pageId, 'title', 'Ancien', { status: 'approved', sourceText: 'Old title' })]
    const out = overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', noReview), true)
    expect(out.title).toBe('Ancien')
  })

  it('with review on, shows only approved and current translations', () => {
    const rows = [
      row(pageId, 'title', 'À propos', { status: 'approved', sourceText: 'About us' }),
      row(pageId, 'seo.metaTitle', 'Brouillon', { status: 'needs_review', sourceText: 'About | Site' }),
      row(pageId, 'seo.metaDescription', 'Machine', { status: 'machine_draft', sourceText: 'Who we are' }),
    ]
    const out = overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', review), true)
    expect(out.title).toBe('À propos')
    expect(out.seo.metaTitle).toBe('About | Site')
    expect(out.seo.metaDescription).toBe('Who we are')
  })

  it('with review on, an approved translation of changed source text is not shown', () => {
    const rows = [row(pageId, 'title', 'Ancien titre', { status: 'approved', sourceText: 'Old title' })]
    const withFallback = overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', review), true)
    expect(withFallback.title).toBe('About us')
    const without = overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', review), false)
    expect(without.title).toBe('')
  })

  it('with review on, an approved translation whose snapshot matches the current source is shown', () => {
    const rows = [row(pageId, 'title', 'À propos', { status: 'approved', sourceText: 'About us' })]
    expect(overlayDocument(page, 'pages', 7, lookupFor(rows, 'fr', review), false).title).toBe('À propos')
  })

  it('does not treat a stale approval as current when the source has changed since it was saved', () => {
    const current = { title: 'About us, revised' }
    expect(
      isTranslationPublishable({ value: 'À propos', status: 'approved', sourceText: 'About us' }, review, current.title),
    ).toBe(false)
  })
})

describe('publishable locales for a document', () => {
  const settings: MultilingualSettings = {
    enabled: true,
    defaultLocale: 'en',
    activeLocales: ['en', 'fr', 'de'],
    fallbackToDefault: true,
    showLanguageSwitcher: true,
    switcherPosition: 'header',
    requireReview: false,
    adminsBypassReview: true,
    translationRules: {},
    machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0 },
  }
  const pageId = sourceIdFor('pages', 7)

  it('lists only the non-default locales with a publishable field', () => {
    const rows = [
      row(pageId, 'title', 'À propos', { locale: 'fr', status: 'approved', sourceText: 'About us' }),
      row(pageId, 'title', 'Über', { locale: 'de', status: 'needs_review', sourceText: 'About us' }),
    ]
    const index = publishIndex(rows)
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: page, index, settings: { ...settings, requireReview: true } })).toEqual(['fr'])
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: page, index, settings: { ...settings, requireReview: false } })).toEqual(['fr', 'de'])
  })

  it('is empty when nothing is translated, and null for a collection with no translatable fields', () => {
    const index = publishIndex([])
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: page, index, settings })).toEqual([])
    expect(publishableLocalesForDocument({ collection: 'unknown', id: 1, doc: page, index, settings })).toBeNull()
  })

  it('ignores rich-text fields, as the overlay does', () => {
    const post = { id: 3, content: 'texte' }
    const index = publishIndex([row(sourceIdFor('posts', 3), 'content', 'texte', { status: 'approved', sourceText: 'texte' })])
    expect(publishableLocalesForDocument({ collection: 'posts', id: 3, doc: post, index, settings })).toEqual([])
  })
})

describe('locale off is identity', () => {
  const off: MultilingualSettings = {
    enabled: false,
    defaultLocale: 'en',
    activeLocales: ['en', 'fr'],
    fallbackToDefault: true,
    showLanguageSwitcher: true,
    switcherPosition: 'header',
    requireReview: false,
    adminsBypassReview: true,
    translationRules: {},
    machine: { enabled: false, defaultProvider: null, overrides: {}, monthlyCharLimit: 0 },
  }

  it('does not prefix links while multilingual is off', () => {
    expect(localisedHref('/shop/mug', 'fr', off)).toBe('/shop/mug')
  })

  it('does not prefix the default locale on links', () => {
    const on = { ...off, enabled: true }
    expect(localisedHref('/shop/mug', 'en', on)).toBe('/shop/mug')
    expect(localisedHref('/shop/mug', 'fr', on)).toBe('/fr/shop/mug')
  })
})
