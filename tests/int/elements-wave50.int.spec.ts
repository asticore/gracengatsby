import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const find = vi.fn()
vi.mock('@/lib/engine', () => ({ getEngine: async () => ({ find, findGlobal: async () => ({}) }) }))
vi.mock('@/features/ecommerce/lib/shopCurrency', () => ({ loadShopCurrency: async () => 'AUD' }))

import { LoopElement } from '@/components/blocks/elements/Wave50Server'
import { loopSettings, loopWhere, stableRank } from '@/components/blocks/elements/Wave50Elements'
import { getElementDef } from '@/lib/elements/registry'
import { WAVE50_ELEMENTS } from '@/lib/elements/wave50Defs'

const html = async (props: Record<string, unknown>) => renderToStaticMarkup(await LoopElement(props))
const post = (id: number, title: string, extra: Record<string, unknown> = {}) => ({ id, title, slug: `p-${id}`, excerpt: 'Short', publishedDate: '2026-03-04T00:00:00.000Z', ...extra })

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [post(1, 'One'), post(2, 'Two')], totalPages: 1 })
})

describe('loop defs', () => {
  it('has defaults and valid fields', () => {
    expect(WAVE50_ELEMENTS).toHaveLength(1)
    const def = WAVE50_ELEMENTS[0]
    expect(def.type).toBe('loop')
    expect(def.defaultProps()).toMatchObject({ source: 'posts', count: 6, layout: 'grid', columns: 3, orderBy: 'date' })
    for (const f of def.fields) expect(f.name && f.label).toBeTruthy()
    void getElementDef
  })
  it('clamps settings', () => {
    expect(loopSettings({ count: 99, columns: 0, source: 'nope', layout: 'x' })).toMatchObject({ count: 24, columns: 1, source: 'posts', layout: 'grid' })
  })
})

describe('loop query', () => {
  it('asks for published items only, with count and sort', async () => {
    await html({ source: 'products', count: 4 })
    const q = find.mock.calls[0][0]
    expect(q.collection).toBe('products')
    expect(q.limit).toBe(4)
    expect(q.sort).toBe('-createdAt')
    expect(q.where.and).toContainEqual({ _status: { equals: 'published' } })
  })
  it('filters by category and excludes the current item', () => {
    const w = loopWhere(loopSettings({ source: 'posts', category: 'News', related: true }), 7)
    expect(w.and).toContainEqual({ 'categories.name': { equals: 'News' } })
    expect(w.and).toContainEqual({ id: { not_equals: 7 } })
  })
  it('random-stable is deterministic', async () => {
    find.mockResolvedValue({ docs: [post(1, 'A'), post(2, 'B'), post(3, 'C')], totalPages: 1 })
    expect(stableRank('1')).toBe(stableRank('1'))
    expect(await html({ orderBy: 'random-stable' })).toBe(await html({ orderBy: 'random-stable' }))
  })
})

describe('loop markup', () => {
  it('renders cards with links and dates', async () => {
    const out = await html({})
    expect(out).toContain('href="/blog/p-1"')
    expect(out).toContain('<time')
    expect(out).toContain('be-el-50-loop--grid')
  })
  it('shows price for products only when asked', async () => {
    find.mockResolvedValue({ docs: [{ id: 1, title: 'Mug', slug: 'mug', priceInAUD: 12.5 }], totalPages: 1 })
    expect(await html({ source: 'products' })).toContain('12.50')
    expect(await html({ source: 'products', showPrice: false })).not.toContain('12.50')
  })
  it('renders each layout', async () => {
    for (const layout of ['grid', 'list', 'carousel']) expect(await html({ layout })).toContain(`be-el-50-loop--${layout}`)
  })
  it('escapes text and refuses unsafe links', async () => {
    find.mockResolvedValue({ docs: [post(1, '<script>alert(1)</script>', { excerpt: '<img src=x onerror=1>' })], totalPages: 1 })
    const out = await html({})
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('<img src=x')
    expect(out).toContain('&lt;script&gt;')
  })
  it('hides toggled parts', async () => {
    const out = await html({ showExcerpt: false, showDate: false })
    expect(out).not.toContain('Short')
    expect(out).not.toContain('<time')
  })
})

describe('loop empty and failure', () => {
  it('shows emptyText when nothing matches', async () => {
    find.mockResolvedValue({ docs: [], totalPages: 1 })
    expect(await html({ emptyText: 'No posts <b>' })).toContain('No posts &lt;b&gt;')
  })
  it('does not throw when the query fails', async () => {
    find.mockRejectedValue(new Error('db down'))
    expect(await html({ emptyText: 'Nothing here' })).toContain('Nothing here')
  })
})

describe('loop paging', () => {
  it('renders a next-page link', async () => {
    find.mockResolvedValue({ docs: [post(1, 'One')], totalPages: 3 })
    const out = await html({ loadMore: true, page: 1 })
    expect(out).toContain('href="?page=2"')
    expect(find.mock.calls[0][0].page).toBe(1)
  })
  it('renders numbered links with the current page marked', async () => {
    find.mockResolvedValue({ docs: [post(1, 'One')], totalPages: 3 })
    const out = await html({ pagination: true, page: 2 })
    expect(out).toContain('aria-current="page"')
    expect(out).toContain('href="?page=3"')
    expect(out).toContain('href="?page=1"')
  })
  it('no pager for one page', async () => {
    expect(await html({ pagination: true, loadMore: true })).not.toContain('?page=')
  })
})
