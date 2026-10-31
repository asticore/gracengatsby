// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page-template Loop (LoopBlock) must give every item the same loop merge tags as the site-template loop:
// {{title}}, {{excerpt}}, {{date}}, {{author}}, {{category}}, {{url}}, {{image}} and {{price}}.
const state = vi.hoisted(() => ({
  templateBlocks: [] as Array<Record<string, unknown>>,
  items: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    findByID: async () => ({ id: 1, blocks: state.templateBlocks }),
    find: async () => ({ docs: state.items }),
  }),
}))

vi.mock('@/features/ecommerce/lib/shopCurrency', () => ({ loadShopCurrency: async () => 'AUD' }))
vi.mock('@/features/customFields/server', () => ({ buildItemTagContexts: async (): Promise<unknown[]> => [] }))
vi.mock('@/components/blocks/StyledBlock', () => ({
  StyledBlock: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

const text = (value: string) => ({ blockType: 'text', text: value })
const renderNode = (node: Record<string, unknown>) => React.createElement('p', null, String(node.text ?? ''))

async function renderLoop(source: string) {
  const { LoopBlock } = await import('@/components/blocks/LoopBlock')
  const element = await LoopBlock({ template: 1, source, limit: 10, columns: 1, sortBy: 'newest', renderNode: (node) => renderNode(node as Record<string, unknown>) as React.ReactElement })
  return renderToStaticMarkup(element as React.ReactElement)
}

beforeEach(() => {
  state.templateBlocks = [text('{{title}} | {{excerpt}} | {{date}} | {{author}} | {{category}} | {{url}} | {{image}}')]
  state.items = [
    {
      id: 7,
      slug: 'silver-care',
      title: 'Silver care',
      excerpt: 'Keep it bright',
      _status: 'published',
      publishedDate: '2026-10-05T00:00:00.000Z',
      author: { displayName: 'Grace Gatsby', slug: 'grace' },
      categories: [{ name: 'Jewellery' }, { name: 'Gifts' }],
      featuredImage: { url: 'https://cdn.example.com/ring.jpg' },
    },
  ]
})

describe('old page-template Loop merge tags', () => {
  it('fills title, excerpt, date, author, category, url and image for a blog post item', async () => {
    const markup = await renderLoop('posts')
    expect(markup).toContain('Silver care | Keep it bright | 05/10/2026 | Grace Gatsby | Jewellery | /blog/silver-care | https://cdn.example.com/ring.jpg')
  })

  it('keeps a product value that the base context already has (price is not replaced by the fallback)', async () => {
    state.templateBlocks = [text('{{price}}|{{category}}|{{date}}')]
    state.items = [{ id: 9, slug: 'ring', title: 'Ring', _status: 'published', priceInAUD: 49.5, category: 'Rings', createdAt: '2026-09-01T00:00:00.000Z' }]
    const markup = await renderLoop('products')
    expect(markup).toContain('$49.50|Rings|01/09/2026')
  })

  it('leaves tags with no value for the item empty, and drops unknown tags (the base resolver does not keep them)', async () => {
    state.templateBlocks = [text('[{{author}}][{{nope}}]')]
    state.items = [{ id: 3, slug: 'bare', title: 'Bare', _status: 'published' }]
    const markup = await renderLoop('posts')
    expect(markup).toContain('[][]')
  })
})
