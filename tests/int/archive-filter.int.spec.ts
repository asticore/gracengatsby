import { describe, expect, it } from 'vitest'

import type { ArchiveItem } from '@/lib/blockContext'
import { archiveFacets, archiveQueryString, filterArchiveItems, isArchiveFilterActive, NO_ARCHIVE_FILTERS, parseArchiveFilters, sortArchiveItems } from '@/features/siteTemplates/archiveFilter'
import { isLoopTemplate, loopItemBlocks, loopItemsFromDocs, LOOP_ITEM_WIDGETS, loopItemOf, parseLoopGridSettings, selectLoopItems } from '@/features/siteTemplates/loopGrid'

describe('parseArchiveFilters', () => {
  it('reads every param and defaults the rest', () => {
    expect(parseArchiveFilters({ category: ' gifts ', tag: 'sale', min: '10', max: '99.5', q: ' ring ', sort: 'price-asc' })).toEqual({
      category: 'gifts', tag: 'sale', min: 10, max: 99.5, q: 'ring', sort: 'price-asc',
    })
    expect(parseArchiveFilters({})).toEqual(NO_ARCHIVE_FILTERS)
  })
  it('ignores bad money, unknown sorts and repeated params take the first value', () => {
    const f = parseArchiveFilters({ min: '-5', max: 'abc', sort: 'random', category: ['a', 'b'] })
    expect(f.min).toBeNull()
    expect(f.max).toBeNull()
    expect(f.sort).toBe('newest')
    expect(f.category).toBe('a')
  })
  it('caps text length', () => {
    expect(parseArchiveFilters({ q: 'x'.repeat(500) }).q).toHaveLength(100)
  })
})

describe('isArchiveFilterActive and archiveQueryString', () => {
  it('is inactive by default and a non-default sort counts as active', () => {
    expect(isArchiveFilterActive(NO_ARCHIVE_FILTERS)).toBe(false)
    expect(isArchiveFilterActive({ ...NO_ARCHIVE_FILTERS, sort: 'title' })).toBe(true)
  })
  it('builds a query only from set values', () => {
    expect(archiveQueryString(NO_ARCHIVE_FILTERS)).toBe('')
    expect(archiveQueryString({ ...NO_ARCHIVE_FILTERS, category: 'gifts', min: 0, sort: 'oldest' })).toBe('?category=gifts&min=0&sort=oldest')
  })
})

const posts = [
  { title: 'Ring care', excerpt: 'Polish gold', categories: ['Gift Ideas'], tags: ['care'], date: '2026-01-02' },
  { title: 'Silver tips', excerpt: 'Keep it bright', categories: ['Care'], tags: ['silver'], date: '2026-03-05' },
  { title: 'Ring guide', excerpt: '', categories: ['Gift ideas'], tags: [], date: '2026-02-01' },
]

describe('filterArchiveItems', () => {
  it('matches category and tag by slug', () => {
    expect(filterArchiveItems(posts, { ...NO_ARCHIVE_FILTERS, category: 'gift-ideas' }).map((p) => p.title)).toEqual(['Ring care', 'Ring guide'])
    expect(filterArchiveItems(posts, { ...NO_ARCHIVE_FILTERS, tag: 'silver' }).map((p) => p.title)).toEqual(['Silver tips'])
  })
  it('searches title and excerpt, case-insensitively', () => {
    expect(filterArchiveItems(posts, { ...NO_ARCHIVE_FILTERS, q: 'GOLD' }).map((p) => p.title)).toEqual(['Ring care'])
  })
  it('keeps the price range inclusive and drops items without a price when a bound is set', () => {
    const products = [{ title: 'A', price: 10 }, { title: 'B', price: 50 }, { title: 'C', price: null }]
    expect(filterArchiveItems(products, { ...NO_ARCHIVE_FILTERS, min: 10, max: 50 }).map((p) => p.title)).toEqual(['A', 'B'])
    expect(filterArchiveItems(products, NO_ARCHIVE_FILTERS)).toHaveLength(3)
  })
  it('returns everything when no filter is set, in the same order', () => {
    expect(filterArchiveItems(posts, NO_ARCHIVE_FILTERS)).toEqual(posts)
  })
})

describe('sortArchiveItems', () => {
  const products = [{ title: 'b', price: 30 }, { title: 'a', price: null }, { title: 'c', price: 10 }]
  it('sorts price with unpriced items last', () => {
    expect(sortArchiveItems(products, 'price-asc').map((p) => p.title)).toEqual(['c', 'b', 'a'])
    expect(sortArchiveItems(products, 'price-desc').map((p) => p.title)).toEqual(['b', 'c', 'a'])
  })
  it('sorts title and dates without mutating the input', () => {
    expect(sortArchiveItems(posts, 'title').map((p) => p.title)).toEqual(['Ring care', 'Ring guide', 'Silver tips'])
    expect(sortArchiveItems(posts, 'newest').map((p) => p.date)).toEqual(['2026-03-05', '2026-02-01', '2026-01-02'])
    expect(sortArchiveItems(posts, 'oldest')[0].date).toBe('2026-01-02')
    expect(posts[0].title).toBe('Ring care')
  })
})

describe('archiveFacets', () => {
  it('lists distinct names once with their slugs, sorted by name', () => {
    expect(archiveFacets(posts)).toEqual({
      categories: [{ slug: 'care', name: 'Care' }, { slug: 'gift-ideas', name: 'Gift Ideas' }],
      tags: [{ slug: 'care', name: 'care' }, { slug: 'silver', name: 'silver' }],
    })
  })
})

describe('parseLoopGridSettings', () => {
  it('clamps numbers and rejects odd template ids and sources', () => {
    const s = parseLoopGridSettings({ loopTemplate: '12', source: 'videos', count: 500, columns: 0, pagination: 'true' })
    expect(s).toMatchObject({ templateId: '12', source: '', count: 48, columns: 1, pagination: true, linkCards: true })
    expect(parseLoopGridSettings({ loopTemplate: '1;drop' }).templateId).toBe('')
  })
})

describe('isLoopTemplate', () => {
  it('needs kind loop, switched on and some blocks', () => {
    const blocks = [{ id: 'a' }]
    expect(isLoopTemplate({ kind: 'loop', enabled: true, blocks })).toBe(true)
    expect(isLoopTemplate({ kind: 'loop', enabled: false, blocks })).toBe(false)
    expect(isLoopTemplate({ kind: 'single-post', enabled: true, blocks })).toBe(false)
    expect(isLoopTemplate({ kind: 'loop', enabled: true, blocks: [] })).toBe(false)
    expect(isLoopTemplate(null)).toBe(false)
  })
})

describe('loopItemBlocks', () => {
  const item: ArchiveItem = { title: 'Ring care', href: '/blog/ring-care', excerpt: 'Polish' }
  const template = [
    { id: 'h', blockType: 'element', elementType: 'post-title', props: { level: 'h2' } },
    { id: 'p', blockType: 'element', elementType: 'heading', props: { text: 'x' } },
    {
      id: 's', blockType: 'section',
      columns: [{ blocks: [{ id: 'e', blockType: 'element', elementType: 'post-excerpt', props: {} }] }],
    },
  ]
  it('attaches the item to item widgets at any depth and leaves the template alone', () => {
    const out = loopItemBlocks(template, item) as typeof template
    expect(out[0].props).toEqual({ level: 'h2', __loopItem: item })
    expect(out[1].props).toEqual({ text: 'x' })
    const nested = (out[2] as unknown as { columns: { blocks: { props: unknown }[] }[] }).columns[0].blocks[0]
    expect(nested.props).toEqual({ __loopItem: item })
    expect(template[0].props).toEqual({ level: 'h2' })
    expect(LOOP_ITEM_WIDGETS.has('post-title')).toBe(true)
  })
  it('loopItemOf reads only a valid item', () => {
    expect(loopItemOf({ __loopItem: item })).toBe(item)
    expect(loopItemOf({})).toBeNull()
    expect(loopItemOf({ __loopItem: { href: '/x' } })).toBeNull()
  })
})

describe('loopItemsFromDocs', () => {
  it('maps posts with names, author and image', () => {
    const [item] = loopItemsFromDocs('posts', [
      { title: 'Hello', slug: 'hello', excerpt: 'Hi', publishedDate: '2026-01-01', categories: [{ name: 'News' }], tags: [{ name: 'x' }], author: { displayName: 'Jo', slug: 'jo' }, featuredImage: { url: '/a.jpg', alt: 'A' } },
    ])
    expect(item).toMatchObject({ title: 'Hello', href: '/blog/hello', author: 'Jo', categories: ['News'], tags: ['x'], image: { url: '/a.jpg', alt: 'A' } })
  })
  it('maps products with price and product type', () => {
    const [item] = loopItemsFromDocs('products', [{ title: 'Ring', slug: 'ring', priceInAUD: 120, category: 'jewellery', productType: 'simple', images: [{ url: '/r.jpg' }] }])
    expect(item).toMatchObject({ href: '/shop/ring', price: 120, type: 'simple', categories: ['jewellery'], image: { url: '/r.jpg', alt: '' } })
  })
  it('maps events with type and venue', () => {
    const [item] = loopItemsFromDocs('events', [{ title: 'Talk', slug: 'talk', startDate: '2026-05-01', eventType: 'free', location: { venueName: 'Hall' } }])
    expect(item).toMatchObject({ href: '/events/talk', type: 'free', author: 'Hall' })
  })
})

describe('selectLoopItems', () => {
  const items: ArchiveItem[] = [
    { title: 'A', href: '/a', author: 'Jo Smith', type: 'simple', date: '2026-01-01' },
    { title: 'B', href: '/b', author: 'Sam', type: 'gift card', date: '2026-02-01' },
    { title: 'C', href: '/c', author: 'Jo Smith', type: 'simple', date: '2026-03-01' },
  ]
  const s = parseLoopGridSettings({ loopTemplate: '1', source: 'posts', author: 'jo-smith', orderBy: 'oldest' })
  it('applies the author setting and orders', () => {
    expect(selectLoopItems(items, s, null).map((i) => i.title)).toEqual(['A', 'C'])
  })
  it('applies the type setting and the archive filters together', () => {
    const t = parseLoopGridSettings({ loopTemplate: '1', type: 'simple' })
    expect(selectLoopItems(items, t, { ...NO_ARCHIVE_FILTERS, q: 'c' }).map((i) => i.title)).toEqual(['C'])
    expect(selectLoopItems(items, t, null).map((i) => i.title)).toEqual(['C', 'A'])
  })
})
