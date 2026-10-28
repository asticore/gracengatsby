import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlockContext } from '@/lib/blockContext'
import { loopPageHref, loopPageNumbers, loopPageParam, parseLoopGridSettings } from '@/features/siteTemplates/loopGrid'

const ctxRef: { current: BlockContext } = { current: {} }
const queryRef: { current: Record<string, string | string[] | undefined> } = { current: {} }
const docsRef: { current: Record<string, unknown>[] } = { current: [] }

vi.mock('@/lib/blockContext', async (orig) => ({
  ...(await orig<typeof import('@/lib/blockContext')>()),
  getBlockContext: () => ctxRef.current,
  getRequestQuery: () => queryRef.current,
}))
vi.mock('@/lib/engine', () => ({ getEngine: async () => ({ find: async () => ({ docs: docsRef.current }) }) }))
vi.mock('@/features/visibility/excludeProtected', async (orig) => ({
  ...(await orig<typeof import('@/features/visibility/excludeProtected')>()),
  excludeProtected: async (_c: string, docs: unknown[]) => docs,
}))
vi.mock('@/features/siteTemplates/resolve', () => ({
  loadSiteTemplate: async () => ({ id: 'card', kind: 'loop', enabled: true, blocks: [{ blockType: 'element', elementType: 'heading', props: { text: '{{title}}' } }] }),
  prepareTemplateBlocks: async (t: { blocks: unknown[] }) => t.blocks,
}))

import { LoopGridElement } from '@/components/blocks/elements/LoopGridServer'

const posts = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, slug: `post-${i + 1}`, title: `Post ${i + 1}`, publishedDate: `2026-10-0${5 - i}` }))

beforeEach(() => {
  docsRef.current = posts
  ctxRef.current = { path: '/news' }
  queryRef.current = {}
})

describe('loop grid page parameter', () => {
  it('defaults to page and accepts a plain word for a second grid', () => {
    expect(loopPageParam(undefined)).toBe('page')
    expect(loopPageParam('lp2')).toBe('lp2')
    expect(loopPageParam('bad name!')).toBe('page')
    expect(parseLoopGridSettings({}).pageParam).toBe('page')
    expect(parseLoopGridSettings({ pageParam: 'lp3' }).pageParam).toBe('lp3')
  })
})

describe('loopPageHref and loopPageNumbers', () => {
  it('keeps other query params and drops the page param on page 1', () => {
    const query = { category: 'care', page: '3', lp2: '4' }
    expect(loopPageHref('/shop', query, 'page', 2)).toBe('/shop?category=care&lp2=4&page=2')
    expect(loopPageHref('/shop', query, 'page', 1)).toBe('/shop?category=care&lp2=4')
    expect(loopPageHref('/shop', {}, 'page', 1)).toBe('/shop')
  })

  it('lists the first and last page with a gap around the current one', () => {
    expect(loopPageNumbers(1, 3)).toEqual([1, 2, 3])
    expect(loopPageNumbers(5, 12)).toEqual([1, null, 3, 4, 5, 6, 7, null, 12])
    expect(loopPageNumbers(1, 10)).toEqual([1, 2, 3, null, 10])
  })
})

describe('a fixed-source grid pages on any page', () => {
  it('shows the page named by its own param, numbered links keep the other params', async () => {
    queryRef.current = { lp2: '2', category: 'care' }
    const el = await LoopGridElement({ loopTemplate: 'card', source: 'posts', count: 2, pagination: true, pageParam: 'lp2' })
    const html = renderToStaticMarkup(el as React.ReactElement)
    expect(html).toContain('Post 3')
    expect(html).toContain('Post 4')
    expect(html).not.toContain('Post 1<')
    expect(html).toContain('href="/news?category=care"')
    expect(html).toContain('href="/news?category=care&amp;lp2=3"')
    expect(html).toContain('aria-current="page"')
  })

  it('reads plain ?page when the grid uses the default name', async () => {
    queryRef.current = { page: '2' }
    const el = await LoopGridElement({ loopTemplate: 'card', source: 'posts', count: 2, pagination: true })
    const html = renderToStaticMarkup(el as React.ReactElement)
    expect(html).toContain('Post 3')
    expect(html).toContain('href="/news?page=3"')
  })

  it('shows the first page only when numbered pages are off', async () => {
    queryRef.current = { page: '2' }
    const el = await LoopGridElement({ loopTemplate: 'card', source: 'posts', count: 2, pagination: false })
    const html = renderToStaticMarkup(el as React.ReactElement)
    expect(html).toContain('Post 1')
    expect(html).not.toContain('Post 3')
    expect(html).not.toContain('aria-label="Pagination"')
  })
})
