import { describe, expect, it } from 'vitest'

import type { MultilingualSettings, TranslationRow } from '@/features/multilingual'
import { publishableLocalesForDocument, publishIndex } from '@/features/multilingual/availability'
import { overlayDocument, lookupFromRows } from '@/features/multilingual/overlay'
import {
  buildSlugIndex,
  isValidTranslatedSlug,
  localizedPath,
  normaliseRoutePath,
  routeLocalizedPath,
  slugMapFor,
  slugSuggestion,
} from '@/features/multilingual/localizedSlugs'
import { checkTranslatedSlug } from '@/features/multilingual/slugClaims'
import { fieldsForDocument, TRANSLATABLE_COLLECTIONS } from '@/features/multilingual/translatableFields'
import { localeSeoFields } from '@/features/seo/localeSeo'

const settings = {
  enabled: true,
  defaultLocale: 'en',
  activeLocales: ['en', 'fr'],
  fallbackToDefault: false,
  requireReview: false,
} as unknown as MultilingualSettings

const reviewOn = { requireReview: true } as const

const row = (sourceId: string, fieldPath: string, value: string | null, extra: Partial<TranslationRow> = {}): TranslationRow => ({
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

describe('slugSuggestion and validity', () => {
  it('lower-cases, hyphenates and trims punctuation', () => {
    expect(slugSuggestion('  Mon Article !  ')).toBe('mon-article')
    expect(slugSuggestion('--Hello__World--')).toBe('hello-world')
  })

  it('keeps letters of other scripts instead of emptying them', () => {
    expect(slugSuggestion('日本語 タイトル')).toBe('日本語-タイトル')
    expect(slugSuggestion('Café Été')).toBe('café-été')
  })

  it('accepts clean slugs and rejects anything that would break a URL segment', () => {
    expect(isValidTranslatedSlug('a-propos')).toBe(true)
    expect(isValidTranslatedSlug('ウェブ')).toBe(true)
    expect(isValidTranslatedSlug('a/b')).toBe(false)
    expect(isValidTranslatedSlug('a b')).toBe(false)
    expect(isValidTranslatedSlug('-a')).toBe(false)
    expect(isValidTranslatedSlug('a--b')).toBe(false)
    expect(isValidTranslatedSlug('')).toBe(false)
  })
})

describe('localizedPath', () => {
  const docIdByPath = new Map([
    ['/services', 'pages:1'],
    ['/services/consulting', 'pages:2'],
    ['/blog/hello', 'posts:9'],
  ])

  it('translates every segment that belongs to a document with a translated slug', () => {
    const slugs = new Map([
      ['pages:1', 'prestations'],
      ['pages:2', 'conseil'],
    ])
    expect(localizedPath('/services/consulting', docIdByPath, slugs)).toBe('/prestations/conseil')
  })

  it('keeps the source segment where a document has no translated slug', () => {
    expect(localizedPath('/services/consulting', docIdByPath, new Map([['pages:1', 'prestations']]))).toBe('/prestations/consulting')
    expect(localizedPath('/blog/hello', docIdByPath, new Map([['posts:9', 'bonjour']]))).toBe('/blog/bonjour')
  })

  it('leaves unrelated paths and the root alone', () => {
    expect(localizedPath('/faq', docIdByPath, new Map([['pages:1', 'x']]))).toBe('/faq')
    expect(localizedPath('/', docIdByPath, new Map())).toBe('/')
  })
})

describe('routing a translated path', () => {
  const docIdByPath = new Map([
    ['/about', 'pages:7'],
    ['/services', 'pages:1'],
    ['/services/consulting', 'pages:2'],
    ['/blog/hello', 'posts:9'],
  ])
  const index = buildSlugIndex(
    docIdByPath,
    new Map([
      ['pages:7', 'a-propos'],
      ['pages:1', 'prestations'],
      ['pages:2', 'conseil'],
    ]),
  )

  it('serves a translated path as its source document', () => {
    expect(routeLocalizedPath('/a-propos', index)).toEqual({ kind: 'translated', sourcePath: '/about' })
    expect(routeLocalizedPath('/prestations/conseil', index)).toEqual({ kind: 'translated', sourcePath: '/services/consulting' })
  })

  it('redirects a source path that has a translated slug', () => {
    expect(routeLocalizedPath('/about', index)).toEqual({ kind: 'redirect', translatedPath: '/a-propos' })
    expect(routeLocalizedPath('/services/consulting', index)).toEqual({ kind: 'redirect', translatedPath: '/prestations/conseil' })
  })

  it('does nothing for paths with no translated slug involved', () => {
    expect(routeLocalizedPath('/contact', index)).toBeNull()
    expect(routeLocalizedPath('/blog/hello', index)).toBeNull()
  })

  it('is empty, and so changes nothing, when no slug is translated', () => {
    const none = buildSlugIndex(docIdByPath, new Map())
    expect(none.toTranslated.size).toBe(0)
    expect(routeLocalizedPath('/about', none)).toBeNull()
  })

  it('normalises query, hash and trailing slashes before matching', () => {
    expect(normaliseRoutePath('/about/?x=1')).toBe('/about')
    expect(normaliseRoutePath('')).toBe('/')
  })
})

describe('publishable translated slugs', () => {
  const pageSource = { id: 7, slug: 'about', title: 'About' }

  it('uses only a publishable slug, judged against the current source slug', () => {
    const approved = row('pages:7', 'slug', 'a-propos', { status: 'approved', sourceText: 'about' })
    const current = [{ sourceId: 'pages:7', slug: 'about' }]
    expect(slugMapFor({ locale: 'fr', index: publishIndex([approved]), settings: reviewOn, docs: current }).get('pages:7')).toBe('a-propos')

    const stale = row('pages:7', 'slug', 'a-propos', { status: 'approved', sourceText: 'old-about' })
    expect(slugMapFor({ locale: 'fr', index: publishIndex([stale]), settings: reviewOn, docs: current }).has('pages:7')).toBe(false)
  })

  it('does not make a page available in a language because only its slug is translated', () => {
    const index = publishIndex([row('pages:7', 'slug', 'a-propos')])
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: pageSource, index, settings })).toEqual([])
    const withTitle = publishIndex([row('pages:7', 'slug', 'a-propos'), row('pages:7', 'title', 'À propos')])
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: pageSource, index: withTitle, settings })).toEqual(['fr'])
  })
})

describe('overlay of the slug', () => {
  const pageSource = { id: 7, title: 'About', slug: 'about' }

  it('overlays a translated slug onto the document', () => {
    const lookup = lookupFromRows('fr', [row('pages:7', 'slug', 'a-propos')], { requireReview: false })
    const out = overlayDocument(pageSource, 'pages', 7, lookup, true)
    expect(out.slug).toBe('a-propos')
  })

  it('never blanks the slug when there is no fallback to the source', () => {
    const lookup = lookupFromRows('fr', [], { requireReview: false })
    const out = overlayDocument(pageSource, 'pages', 7, lookup, false)
    expect(out.slug).toBe('about')
    expect(out.title).toBe('')
  })
})

describe('translatable slug fields', () => {
  it('offers the slug for pages, posts and products, and not for events', () => {
    for (const collection of ['pages', 'posts', 'products']) {
      expect(fieldsForDocument(collection, { title: 'T', slug: 'x' }).map((f) => f.path)).toContain('slug')
    }
    expect(fieldsForDocument('events', { title: 'T', slug: 'x' }).map((f) => f.path)).not.toContain('slug')
    expect(TRANSLATABLE_COLLECTIONS.find((entry) => entry.slug === 'pages')?.fields.some((f) => f.path === 'slug')).toBe(true)
  })
})

describe('uniqueness of translated slugs', () => {
  type Doc = { id: number; slug: string; availableDomains?: string; parent?: number | null }

  /** A small engine over in-memory tables, understanding the where shapes the claim check uses. */
  const engineWith = (tables: Record<string, Array<Record<string, unknown>>>) => {
    const matches = (record: Record<string, unknown>, where: Record<string, unknown>): boolean => {
      if (Array.isArray(where.and)) return (where.and as Record<string, unknown>[]).every((clause) => matches(record, clause))
      return Object.entries(where).every(([field, condition]) => {
        const value = record[field]
        const test = condition as Record<string, unknown>
        if ('equals' in test) return String(value) === String(test.equals)
        if ('not_equals' in test) return String(value) !== String(test.not_equals)
        return true
      })
    }
    return {
      find: async (args: Record<string, unknown>) => {
        const collection = String(args.collection)
        const where = args.where as Record<string, unknown>
        return { docs: (tables[collection] ?? []).filter((record) => matches(record, where)) }
      },
      findByID: async (args: Record<string, unknown>) =>
        (tables[String(args.collection)] ?? []).find((record) => String(record.id) === String(args.id)) ?? null,
    }
  }

  const pages: Doc[] = [
    { id: 1, slug: 'about', availableDomains: '' },
    { id: 2, slug: 'contact', availableDomains: '' },
    { id: 3, slug: 'home-a', availableDomains: 'a.example' },
    { id: 4, slug: 'home-b', availableDomains: 'b.example' },
  ]

  it('refuses a slug another document already has in this language', async () => {
    const engine = engineWith({
      pages,
      translations: [{ locale: 'fr', sourceKind: 'collection', sourceId: 'pages:2', fieldPath: 'slug', value: 'a-propos' }],
    })
    const claim = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 1, locale: 'fr', slug: 'a-propos' })
    expect(claim.ok).toBe(false)
  })

  it('refuses a slug equal to another shared document source slug that still answers in this language', async () => {
    const engine = engineWith({ pages, translations: [] })
    const claim = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 9, locale: 'fr', slug: 'contact' })
    expect(claim.ok).toBe(false)
  })

  it('allows a source slug that is already translated in this language, since it redirects', async () => {
    const engine = engineWith({
      pages,
      translations: [{ locale: 'fr', sourceKind: 'collection', sourceId: 'pages:2', fieldPath: 'slug', value: 'nous-contacter' }],
    })
    const claim = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 9, locale: 'fr', slug: 'contact' })
    expect(claim.ok).toBe(true)
  })

  it('allows the same slug on domains that do not overlap', async () => {
    const engine = engineWith({
      pages,
      translations: [{ locale: 'fr', sourceKind: 'collection', sourceId: 'pages:3', fieldPath: 'slug', value: 'accueil' }],
    })
    const onB = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 4, locale: 'fr', slug: 'accueil' })
    expect(onB.ok).toBe(true)
    const onA = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 2, locale: 'fr', slug: 'accueil' })
    expect(onA.ok).toBe(true)
  })

  it('does not clash across languages', async () => {
    const engine = engineWith({
      pages,
      translations: [{ locale: 'de', sourceKind: 'collection', sourceId: 'pages:2', fieldPath: 'slug', value: 'a-propos' }],
    })
    const claim = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 1, locale: 'fr', slug: 'a-propos' })
    expect(claim.ok).toBe(true)
  })

  it('compares pages only with siblings under the same parent', async () => {
    const nested: Doc[] = [
      { id: 10, slug: 'team', parent: 1 },
      { id: 11, slug: 'about-team', parent: 2 },
    ]
    const engine = engineWith({
      pages: nested,
      translations: [{ locale: 'fr', sourceKind: 'collection', sourceId: 'pages:11', fieldPath: 'slug', value: 'equipe' }],
    })
    const sibling = await checkTranslatedSlug({ engine, collection: 'pages', documentId: 12, locale: 'fr', slug: 'equipe' })
    expect(sibling.ok).toBe(true)
    const sameParent = engineWith({
      pages: [...nested, { id: 13, slug: 'x', parent: 1 }],
      translations: [{ locale: 'fr', sourceKind: 'collection', sourceId: 'pages:11', fieldPath: 'slug', value: 'equipe' }],
    })
    const clash = await checkTranslatedSlug({ engine: sameParent, collection: 'pages', documentId: 13, locale: 'fr', slug: 'equipe' })
    expect(clash.ok).toBe(true)
  })

  it('rejects a slug that cannot sit in a URL', async () => {
    const claim = await checkTranslatedSlug({ engine: engineWith({ pages }), collection: 'pages', documentId: 1, locale: 'fr', slug: 'a/b' })
    expect(claim.ok).toBe(false)
  })
})

describe('locale SEO with translated slugs', () => {
  it('builds canonical and hreflang from each locale path', () => {
    const out = localeSeoFields({
      baseUrl: 'https://example.com',
      path: '/about',
      locale: 'fr',
      settings,
      explicitCanonical: false,
      localizedPaths: { fr: '/a-propos' },
    })
    expect(out?.canonical).toBe('https://example.com/fr/a-propos')
    expect(out?.alternates).toEqual([
      { hreflang: 'en', href: 'https://example.com/about' },
      { hreflang: 'fr', href: 'https://example.com/fr/a-propos' },
      { hreflang: 'x-default', href: 'https://example.com/about' },
    ])
  })

  it('keeps the source path for a locale with no translated slug', () => {
    const out = localeSeoFields({
      baseUrl: 'https://example.com',
      path: '/about',
      locale: 'fr',
      settings,
      explicitCanonical: false,
    })
    expect(out?.canonical).toBe('https://example.com/fr/about')
  })
})
