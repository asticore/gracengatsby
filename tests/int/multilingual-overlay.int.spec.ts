import { describe, expect, it } from 'vitest'

import { localisedHref, sourceIdFor, type MultilingualSettings, type TranslationRow } from '@/features/multilingual'
import { isTranslationPublishable, lookupFromRows, overlayDocument } from '@/features/multilingual/overlay'

const row = (sourceId: string, fieldPath: string, value: string | null, locale = 'fr'): TranslationRow => ({
  id: `${sourceId}:${fieldPath}`,
  locale,
  sourceKind: 'collection',
  status: null,
  assignedTo: [],
  machineProvider: null,
  reviewedBy: null,
  reviewedAt: null,
  sourceId,
  fieldPath,
  value,
  sourceText: null,
})

const lookupFor = (rows: TranslationRow[], locale = 'fr') => lookupFromRows(locale, rows)

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

describe('isTranslationPublishable seam', () => {
  it('accepts every row by default', () => {
    expect(isTranslationPublishable(row('pages:1', 'title', 'x'))).toBe(true)
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
