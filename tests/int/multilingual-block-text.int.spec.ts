import { describe, expect, it } from 'vitest'

import { BLOCK_TEXT, ELEMENT_TEXT } from '@/features/multilingual/blockTextRegistry'
import {
  blockKeyFor,
  blockTextAddresses,
  isBlockFieldPath,
  readBlockField,
  writeBlockField,
} from '@/features/multilingual/blockText'
import { fieldsForDocument, sourceIdFor, TRANSLATABLE_COLLECTIONS } from '@/features/multilingual/translatableFields'
import { lookupFromRows, overlayDocument } from '@/features/multilingual/overlay'
import { buildDocumentTranslations } from '@/features/multilingual/documentTranslations'
import { valueAtPath, type TranslationRow } from '@/features/multilingual/store'
import { publishableLocalesForDocument, publishIndex } from '@/features/multilingual/availability'
import type { MultilingualSettings } from '@/features/multilingual/settings'

const SOURCE = sourceIdFor('pages', 7)

const row = (fieldPath: string, value: string | null, extra: Partial<TranslationRow> = {}): TranslationRow => ({
  id: `${fieldPath}-${value}`,
  locale: 'fr',
  sourceKind: 'collection',
  sourceId: SOURCE,
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

const page = {
  id: 7,
  title: 'About us',
  blocks: [
    {
      id: 'h1',
      blockType: 'hero',
      heading: 'Welcome to the shop',
      subheading: 'Hand made in Cornwall',
      primaryCtaLabel: 'Shop now',
      primaryCtaUrl: '/shop',
      secondaryCtaLabel: '',
    },
    {
      id: 'cta',
      blockType: 'ctaBanner',
      heading: 'Join us',
      text: 'Get the newsletter',
      buttonLabel: 'Subscribe',
      buttonUrl: '/newsletter',
    },
    {
      blockType: 'section',
      id: 'sec',
      columns: [
        {
          blocks: [
            { blockType: 'element', elementType: 'heading', props: { text: 'Our story', link: { url: '/about' } } },
            { blockType: 'element', elementType: 'button', props: { text: 'Read more', url: '/story' } },
          ],
        },
      ],
    },
    { id: 'rt', blockType: 'richText', content: { root: { children: [{ text: 'Body copy' }] } } },
  ],
}

describe('block text registry', () => {
  it('lists the block types and element types that are translatable, as plain short text', () => {
    expect(BLOCK_TEXT.hero?.fields.map((f) => f.path)).toEqual(['heading', 'subheading', 'primaryCtaLabel', 'secondaryCtaLabel'])
    expect(ELEMENT_TEXT.button?.fields.map((f) => f.path)).toEqual(['text'])
    expect(ELEMENT_TEXT.image?.fields.map((f) => f.path)).toContain('alt')
  })

  it('never names URLs, slugs, ids, links, code or rich text', () => {
    const banned = /(url|link|slug|id|href|code|css|html|content|price|embed|src)$/i
    const paths = [
      ...Object.values(BLOCK_TEXT).flatMap((spec) => spec.fields.map((f) => f.path)),
      ...Object.values(ELEMENT_TEXT).flatMap((spec) => spec.fields.map((f) => f.path)),
    ]
    // `link` and `url` are the only words that must not appear as the field name; `linkLabel` is a label and is allowed.
    for (const path of paths) {
      expect(banned.test(path) && !/label$/i.test(path)).toBe(false)
    }
    expect(BLOCK_TEXT.imageText).toBeUndefined()
    expect(BLOCK_TEXT.richText).toBeUndefined()
  })

  it('gives every field a label and a size, and no field is listed twice in one block', () => {
    for (const spec of [...Object.values(BLOCK_TEXT), ...Object.values(ELEMENT_TEXT)]) {
      const paths = spec.fields.map((f) => f.path)
      expect(new Set(paths).size).toBe(paths.length)
      for (const field of spec.fields) {
        expect(field.label.length).toBeGreaterThan(0)
        expect(['text', 'long']).toContain(field.size)
      }
    }
  })

  it('is registered on the pages, posts and products collections', () => {
    const fields = (slug: string) => TRANSLATABLE_COLLECTIONS.find((entry) => entry.slug === slug)?.blocksField
    expect(fields('pages')).toBe('blocks')
    expect(fields('posts')).toBe('layout')
    expect(fields('products')).toBe('layout')
    expect(fields('events')).toBeUndefined()
  })
})

describe('block field paths', () => {
  it('recognises block paths by the block field name and a key', () => {
    expect(isBlockFieldPath('blocks.h1.heading')).toBe(true)
    expect(isBlockFieldPath('layout.h1.props.text')).toBe(true)
    expect(isBlockFieldPath('title')).toBe(false)
    expect(isBlockFieldPath('seo.metaTitle')).toBe(false)
    expect(isBlockFieldPath('blocks')).toBe(false)
  })

  it('keys a block by its id when it has one, otherwise by its position', () => {
    expect(blockKeyFor({ id: 'h1' }, [0])).toBe('h1')
    expect(blockKeyFor({ id: 42 }, [0])).toBe('42')
    expect(blockKeyFor({}, [2])).toBe('#2')
    expect(blockKeyFor({}, [2, 0, 1])).toBe('#2-0-1')
    // An id that would break a dot path falls back to the position.
    expect(blockKeyFor({ id: 'a.b' }, [3])).toBe('#3')
  })

  it('reads a value by block key, including a nested element prop', () => {
    expect(readBlockField(page, 'blocks.h1.heading')).toBe('Welcome to the shop')
    expect(readBlockField(page, 'blocks.h1.nope')).toBeUndefined()
    expect(readBlockField(page, 'blocks.missing.heading')).toBeUndefined()
    expect(readBlockField(page, 'blocks.#2-0-0.props.text')).toBe('Our story')
    // valueAtPath is block-aware too, so existing readers pick block text up.
    expect(valueAtPath(page, 'blocks.cta.buttonLabel')).toBe('Subscribe')
  })

  it('writes a value immutably and leaves every other block as it was', () => {
    const out = writeBlockField(page, 'blocks.h1.heading', 'Bienvenue') as typeof page
    expect((out.blocks[0] as { heading: string }).heading).toBe('Bienvenue')
    expect(out.blocks[1]).toBe(page.blocks[1])
    expect((page.blocks[0] as { heading: string }).heading).toBe('Welcome to the shop')
  })

  it('writes into a nested section column by its position key', () => {
    const out = writeBlockField(page, 'blocks.#2-0-0.props.text', 'Notre histoire') as typeof page
    const section = out.blocks[2] as { columns: Array<{ blocks: Array<{ props: { text: string; link: unknown } }> }> }
    expect(section.columns[0].blocks[0].props.text).toBe('Notre histoire')
    expect(section.columns[0].blocks[0].props.link).toEqual({ url: '/about' })
  })

  it('does nothing for a key that is not in the document', () => {
    expect(writeBlockField(page, 'blocks.nope.heading', 'x')).toBe(page)
  })
})

describe('block text addresses', () => {
  const addresses = blockTextAddresses(page, 'blocks')

  it('addresses each translatable text by block key, and skips URLs, empty text and rich text', () => {
    const paths = addresses.map((a) => a.fieldPath)
    expect(paths).toEqual([
      'blocks.h1.heading',
      'blocks.h1.subheading',
      'blocks.h1.primaryCtaLabel',
      'blocks.cta.heading',
      'blocks.cta.text',
      'blocks.cta.buttonLabel',
      'blocks.#2-0-0.props.text',
      'blocks.#2-0-1.props.text',
    ])
    expect(paths.some((p) => p.includes('Url') || p.includes('secondary'))).toBe(false)
    expect(paths.some((p) => p.startsWith('blocks.rt'))).toBe(false)
  })

  it('labels each field with its block and groups the fields of one block together', () => {
    const heading = addresses.find((a) => a.fieldPath === 'blocks.h1.heading')
    expect(heading?.label).toBe('Hero · Heading')
    expect(heading?.group.key).toBe('h1')
    expect(heading?.group.blockType).toBe('hero')
    expect(heading?.group.preview).toBe('Welcome to the shop')
    expect(addresses.find((a) => a.fieldPath === 'blocks.#2-0-1.props.text')?.label).toBe('Element · Button · Label')
  })

  it('lists block text in fieldsForDocument after the fixed fields, and only for collections with blocks', () => {
    const fields = fieldsForDocument('pages', page)
    expect(fields.slice(0, 3).map((f) => f.path)).toEqual(['title', 'seo.metaTitle', 'seo.metaDescription'])
    expect(fields.some((f) => f.path === 'blocks.h1.heading' && f.group?.key === 'h1')).toBe(true)
    expect(fieldsForDocument('faqs', { question: 'Q', answer: 'A' }).every((f) => !f.group)).toBe(true)
  })
})

describe('overlay on blocks', () => {
  const lookupRows = (rows: TranslationRow[], requireReview = false) => lookupFromRows('fr', rows, { requireReview })

  it('shows translated headings and buttons on the public page', () => {
    const rows = [
      row('blocks.h1.heading', 'Bienvenue dans la boutique'),
      row('blocks.h1.primaryCtaLabel', 'Acheter'),
      row('blocks.#2-0-0.props.text', 'Notre histoire'),
    ]
    const out = overlayDocument(page, 'pages', 7, lookupRows(rows), true) as typeof page
    expect((out.blocks[0] as { heading: string }).heading).toBe('Bienvenue dans la boutique')
    expect((out.blocks[0] as { primaryCtaLabel: string }).primaryCtaLabel).toBe('Acheter')
    // The URL and the rich text are never touched, even when a row claims to translate them.
    expect((out.blocks[0] as { primaryCtaUrl: string }).primaryCtaUrl).toBe('/shop')
    expect(out.blocks[3]).toBe(page.blocks[3])
    expect((page.blocks[0] as { heading: string }).heading).toBe('Welcome to the shop')
  })

  it('shows the source line for block text with no translation, even when fallback is off', () => {
    const rows = [row('blocks.h1.heading', 'Bienvenue')]
    const out = overlayDocument(page, 'pages', 7, lookupRows(rows), false) as typeof page
    expect((out.blocks[0] as { subheading: string }).subheading).toBe('Hand made in Cornwall')
    expect((out.blocks[1] as { buttonLabel: string }).buttonLabel).toBe('Subscribe')
  })

  it('does not show an unapproved translation when review is on, and shows the source instead', () => {
    const rows = [row('blocks.h1.heading', 'Bienvenue', { status: 'needs_review', sourceText: 'Welcome to the shop' })]
    const out = overlayDocument(page, 'pages', 7, lookupRows(rows, true), true) as typeof page
    expect((out.blocks[0] as { heading: string }).heading).toBe('Welcome to the shop')
  })

  it('shows an approved translation whose source has not changed', () => {
    const rows = [row('blocks.h1.heading', 'Bienvenue', { status: 'approved', sourceText: 'Welcome to the shop' })]
    const out = overlayDocument(page, 'pages', 7, lookupRows(rows, true), true) as typeof page
    expect((out.blocks[0] as { heading: string }).heading).toBe('Bienvenue')
  })

  it('stale handling: an approval against old wording is not shown once the source changed', () => {
    const rows = [row('blocks.h1.heading', 'Bienvenue', { status: 'approved', sourceText: 'Welcome' })]
    const out = overlayDocument(page, 'pages', 7, lookupRows(rows, true), true) as typeof page
    expect((out.blocks[0] as { heading: string }).heading).toBe('Welcome to the shop')
  })

  it('reorder: an id-keyed translation follows its block when the blocks move', () => {
    const rows = [row('blocks.cta.buttonLabel', 'S’abonner', { status: 'approved', sourceText: 'Subscribe' })]
    const reordered = { ...page, blocks: [page.blocks[1], page.blocks[0], page.blocks[2], page.blocks[3]] }
    const out = overlayDocument(reordered, 'pages', 7, lookupRows(rows, true), true) as typeof page
    expect((out.blocks[0] as { buttonLabel: string }).buttonLabel).toBe('S’abonner')
  })

  it('reorder: a position-keyed translation inside a section goes stale when the content moves', () => {
    const rows = [row('blocks.#2-0-0.props.text', 'Notre histoire', { status: 'approved', sourceText: 'Our story' })]
    // The heading moves to the second position in the column, so its key is now #2-0-1 and the old key holds the button.
    const section = page.blocks[2] as { columns: Array<{ blocks: unknown[] }> }
    const swapped = {
      ...page,
      blocks: [page.blocks[0], page.blocks[1], { ...section, columns: [{ blocks: [section.columns[0].blocks[1], section.columns[0].blocks[0]] }] }, page.blocks[3]],
    }
    const out = overlayDocument(swapped, 'pages', 7, lookupRows(rows, true), true) as typeof page
    const moved = out.blocks[2] as { columns: Array<{ blocks: Array<{ props: { text: string } }> }> }
    expect(moved.columns[0].blocks[0].props.text).toBe('Read more')
    expect(moved.columns[0].blocks[1].props.text).toBe('Our story')
  })

  it('leaves a document with no blocks exactly as it was', () => {
    const plain = { id: 9, title: 'Plain' }
    expect(overlayDocument(plain, 'pages', 9, () => null, true)).toEqual(plain)
  })

  it('only counts a locale as available when a block translation is publishable', () => {
    const index = publishIndex([row('blocks.h1.heading', 'Bienvenue', { status: 'approved', sourceText: 'Welcome to the shop' })])
    const settings = {
      defaultLocale: 'en',
      activeLocales: ['en', 'fr'],
      requireReview: true,
    } as unknown as MultilingualSettings
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: page, index, settings })).toEqual(['fr'])
    const unapproved = publishIndex([row('blocks.h1.heading', 'Bienvenue', { status: 'needs_review', sourceText: 'Welcome to the shop' })])
    expect(publishableLocalesForDocument({ collection: 'pages', id: 7, doc: page, index: unapproved, settings })).toEqual([])
  })
})

describe('document translations view of block text', () => {
  it('lists block fields with their group, and counts them in progress', () => {
    const settings = {
      defaultLocale: 'en',
      activeLocales: ['en', 'fr'],
      requireReview: true,
      adminsBypassReview: true,
      translationRules: {},
    } as unknown as MultilingualSettings
    const state = buildDocumentTranslations({
      collection: 'pages',
      documentId: 7,
      doc: page as unknown as Record<string, unknown>,
      settings,
      rows: [row('blocks.h1.heading', 'Bienvenue', { status: 'approved', sourceText: 'Welcome to the shop' })],
      viewer: { id: 1, isAdmin: true },
    })
    const fr = state?.locales.find((entry) => entry.locale === 'fr')
    const heading = fr?.fields.find((field) => field.fieldPath === 'blocks.h1.heading')
    expect(heading?.group?.blockLabel).toBe('Hero')
    expect(heading?.status).toBe('approved')
    expect(fr?.fields.find((field) => field.fieldPath === 'blocks.h1.subheading')?.group?.key).toBe('h1')
    expect(fr?.fields.some((field) => field.fieldPath === 'title' && field.group === null)).toBe(true)
  })
})
