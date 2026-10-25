import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Where = Record<string, unknown>

const { mockEngine } = vi.hoisted(() => ({
  mockEngine: {
    find: vi.fn(),
    findGlobal: vi.fn(),
  },
}))

vi.mock('@/features/organizations/visibility', () => ({ orgGateLocked: async () => false, listOrgRestrictedIdsLive: async () => new Set<number>() }))
vi.mock('@/lib/engine', () => ({
  getEngine: vi.fn(async () => mockEngine),
}))

// No database here: password protection is covered in password-leaks*.int.spec.ts.
vi.mock('@/features/visibility/excludeProtected', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/visibility/excludeProtected')>()),
  excludeProtected: async (_c: string, docs: unknown[]) => docs,
}))

import SearchPage, { metadata } from '@/app/(frontend)/search/page'

const PAGES: Row[] = [
  { id: 1, title: 'About Grace', slug: 'about', _status: 'published', seo: { metaDescription: 'Our story and values' } },
  { id: 2, title: 'Contact', slug: 'contact', _status: 'published', seo: { metaDescription: 'Write to us' } },
]

const POSTS: Row[] = [
  { id: 10, title: 'Grace in the garden', slug: 'garden', excerpt: 'Spring notes', _status: 'published' },
  { id: 11, title: 'Winter recipes', slug: 'winter', excerpt: 'Soups for cold days', _status: 'published' },
]

const PRODUCTS: Row[] = [{ id: 20, title: 'Grace candle', slug: 'grace-candle', _status: 'published' }]
const EVENTS: Row[] = [{ id: 30, title: 'Grace open day', slug: 'open-day', _status: 'published' }]

/** Evaluates the subset of the Where syntax the page sends: and, or, equals and contains. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'and') return (value as Where[]).every((part) => matches(row, part))
    if (key === 'or') return (value as Where[]).some((part) => matches(row, part))
    return Object.entries(value as Record<string, unknown>).every(([operator, operand]) => {
      const field = row[key]
      if (operator === 'equals') return field === operand
      if (operator === 'contains') return typeof field === 'string' && field.toLowerCase().includes(String(operand).toLowerCase())
      throw new Error(`unsupported operator ${operator}`)
    })
  })
}

const COLLECTIONS: Record<string, Row[]> = { pages: PAGES, posts: POSTS, products: PRODUCTS, events: EVENTS }

function useCollections(overrides: Partial<Record<string, Row[] | 'fail'>> = {}, features: Record<string, boolean> = { blog: true, ecommerce: true, events: true }) {
  mockEngine.findGlobal.mockImplementation(async () => ({ features }))
  mockEngine.find.mockImplementation(async (args: { collection: string; where?: Where; limit?: number }) => {
    const override = overrides[args.collection]
    if (override === 'fail') throw new Error('database unavailable')
    const rows = (override ?? COLLECTIONS[args.collection] ?? []) as Row[]
    const matched = args.where ? rows.filter((row) => matches(row, args.where as Where)) : rows
    const limit = args.limit && args.limit > 0 ? args.limit : matched.length
    return { docs: matched.slice(0, limit), totalDocs: matched.length }
  })
}

const render = async (params: Record<string, string | string[] | undefined>) =>
  renderToStaticMarkup(await SearchPage({ searchParams: Promise.resolve(params) }) as React.ReactElement)

describe('/search results page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCollections()
  })

  it('renders the form and a hint only for an empty query', async () => {
    const html = await render({})
    expect(html).toContain('action="/search"')
    expect(html).toContain('name="q"')
    expect(html).toContain('role="search"')
    expect(html).toContain('Enter a word or phrase')
    expect(html).not.toContain('<ol')
    // The page template lookup is not a search; no content collection may be queried.
    expect(mockEngine.find.mock.calls.filter(([args]) => (args as { collection: string }).collection !== 'site-templates')).toEqual([])
  })

  it('treats a whitespace-only query as empty', async () => {
    const html = await render({ q: '   ' })
    expect(html).toContain('Enter a word or phrase')
    // The page template lookup is not a search; no content collection may be queried.
    expect(mockEngine.find.mock.calls.filter(([args]) => (args as { collection: string }).collection !== 'site-templates')).toEqual([])
  })

  it('lists matching titles from every switched-on collection and skips the rest', async () => {
    const html = await render({ q: 'grace' })
    expect(html).toContain('About Grace')
    expect(html).toContain('Grace in the garden')
    expect(html).toContain('Grace candle')
    expect(html).toContain('Grace open day')
    expect(html).not.toContain('Winter recipes')
    expect(html).not.toContain('>Contact<')
    expect(html).toContain('href="/about"')
    expect(html).toContain('href="/blog/garden"')
    expect(html).toContain('href="/shop/grace-candle"')
    expect(html).toContain('href="/events/open-day"')
    expect(html).toContain('4 results for &quot;grace&quot;')
  })

  it('matches on the excerpt and meta description too', async () => {
    const html = await render({ q: 'soups' })
    expect(html).toContain('Winter recipes')
    const page = await render({ q: 'values' })
    expect(page).toContain('About Grace')
  })

  it('accepts the legacy s parameter', async () => {
    const html = await render({ s: 'contact' })
    expect(html).toContain('>Contact<')
  })

  it('leaves out posts when the blog is off and products when the shop is off', async () => {
    useCollections({}, { blog: false, ecommerce: false, events: true })
    const html = await render({ q: 'grace' })
    expect(html).not.toContain('Grace in the garden')
    expect(html).not.toContain('Grace candle')
    expect(html).toContain('Grace open day')
  })

  it('shows an empty result line when nothing matches', async () => {
    const html = await render({ q: 'zzz-no-match' })
    expect(html).toContain('No results for &quot;zzz-no-match&quot;.')
    expect(html).not.toContain('<ol')
  })

  it('returns empty results when a read fails instead of throwing', async () => {
    useCollections({ posts: 'fail', products: 'fail', events: 'fail' })
    const html = await render({ q: 'grace' })
    expect(html).toContain('About Grace')
    expect(html).not.toContain('Grace in the garden')
  })

  it('escapes the query and the results (no raw markup in the output)', async () => {
    const payload = '<script>alert(1)</script>'
    const html = await render({ q: payload })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('dangerouslySetInnerHTML')

    useCollections({ posts: [{ id: 99, title: `<img src=x onerror=alert(1)> Grace`, slug: 'xss', _status: 'published' }] })
    const withTitle = await render({ q: 'grace' })
    expect(withTitle).not.toContain('<img src=x')
    expect(withTitle).toContain('&lt;img src=x onerror=alert(1)&gt; Grace')
  })

  it('clips the query to 80 characters', async () => {
    const long = 'a'.repeat(120)
    const html = await render({ q: long })
    expect(html).toContain(`value="${'a'.repeat(80)}"`)
    expect(html).not.toContain('a'.repeat(81))
  })

  it('is marked noindex with follow on', () => {
    expect(metadata.title).toBe('Search')
    expect(metadata.robots).toMatchObject({ index: false, follow: true })
    expect(metadata.robots).toMatchObject({ googleBot: { index: false, follow: true } })
  })
})
