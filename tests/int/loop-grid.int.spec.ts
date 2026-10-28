import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { BlockContext } from '@/lib/blockContext'
import { SITE_TEMPLATE_KINDS } from '@/collections/SiteTemplates'
import { KIND_LABELS, TEMPLATE_TYPE_TABS } from '@/features/siteTemplates/kinds'
import { computeTemplateCoverage } from '@/features/siteTemplates/coverage'
import { ArchiveFilterElement } from '@/components/blocks/elements/ArchiveFilter'
import { LoopGridElement } from '@/components/blocks/elements/LoopGridServer'
import { PostExcerptElement, PostTitleElement, ProductPriceElement } from '@/components/blocks/elements/Wave63Server'
import { LOOP_GRID_ELEMENTS } from '@/lib/elements/loopDefs'
import { ELEMENTS } from '@/lib/elements/registry'
import { SITE_ELEMENT_TYPES } from '@/lib/elements/wave38Defs'

// React cache() gives a fresh holder outside a request, so the archive context is supplied here instead.
const ctxRef: { current: BlockContext } = { current: {} }
vi.mock('@/lib/blockContext', async (orig) => ({ ...(await orig<typeof import('@/lib/blockContext')>()), getBlockContext: () => ctxRef.current }))

describe('loop kind', () => {
  it('is a site template kind labelled Loop item, with its own tab and no coverage warning', () => {
    expect(SITE_TEMPLATE_KINDS).toContain('loop')
    expect(KIND_LABELS.loop).toBe('Loop item')
    expect(TEMPLATE_TYPE_TABS.find((t) => t.kinds.includes('loop'))?.label).toBe('Loop item')
    expect(computeTemplateCoverage([]).some((w) => w.kind === 'loop')).toBe(false)
  })
})

describe('loop grid and filter element registration', () => {
  it('registers both widgets as server site elements with fields', () => {
    for (const type of ['loop-grid', 'archive-filter']) {
      expect(SITE_ELEMENT_TYPES.has(type)).toBe(true)
      expect(ELEMENTS.some((e) => e.type === type)).toBe(true)
    }
    const grid = LOOP_GRID_ELEMENTS.find((e) => e.type === 'loop-grid')
    expect(grid?.fields.find((f) => f.name === 'loopTemplate')?.optionsUrl).toBe('/api/admin-loop-templates')
    expect(grid?.defaultProps?.()).toMatchObject({ loopTemplate: '', source: '', linkCards: true })
  })
})

describe('item widgets read the loop item', () => {
  it('draw the card item instead of the page', async () => {
    const item = { title: 'Card title', href: '/blog/card', excerpt: 'Card excerpt', price: 42 }
    const title = await PostTitleElement({ __loopItem: item })
    expect((title as React.ReactElement<{ children: unknown }>).props.children).toBe('Card title')
    const excerpt = await PostExcerptElement({ __loopItem: item })
    expect((excerpt as React.ReactElement<{ children: unknown }>).props.children).toBe('Card excerpt')
    const price = await ProductPriceElement({ __loopItem: item })
    expect(price).not.toBeNull()
  })
})

describe('server widgets outside a loop or archive', () => {
  it('render nothing without a template or archive', async () => {
    ctxRef.current = { path: '/' }
    expect(await ArchiveFilterElement({})).toBeNull()
    expect(await LoopGridElement({ loopTemplate: '' })).toBeNull()
  })
  it('the filter writes to the archive address with its values', async () => {
    ctxRef.current = {
      path: '/blog',
      archive: { basePath: '/blog?sort=title', page: 1, pages: 1, items: [], kind: 'posts', filters: { category: '', tag: '', min: null, max: null, q: 'ring', sort: 'title' }, facets: { categories: [{ slug: 'care', name: 'Care' }], tags: [] } },
    }
    const el = await ArchiveFilterElement({})
    expect(el).not.toBeNull()
    const html = renderToStaticMarkup(el as React.ReactElement)
    expect(html).toContain('action="/blog"')
    expect(html).toContain('value="care"')
    expect(html).toContain('value="ring"')
    expect(html).toContain('value="title" selected=""')
    ctxRef.current = {}
  })
})
