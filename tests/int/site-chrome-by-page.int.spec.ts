// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Header and footer templates by page. The layout reads the request path from the request headers (x-pathname, then
// next-url), so these tests feed headers the same way and check which header and footer each page gets.
const state = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>> }))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    find: async () => ({ docs: state.docs.filter((d) => d.enabled !== false) }),
    findByID: async ({ id }: { id: number | string }) => state.docs.find((d) => String(d.id) === String(id)) ?? null,
  }),
}))

vi.mock('@/components/blocks/BlockRenderer', async () => {
  const R = await import('react')
  const Block = ({ block }: { block: { text?: string } }) => R.createElement('p', null, block.text)
  return { BlockRenderer: Block }
})

const text = (value: string) => ({ blockType: 'text', text: value })
const rule = (value: string) => ({ param: 'path', operator: 'equals', value })
const template = (id: number, kind: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `t${id}`,
  kind,
  enabled: true,
  priority: 0,
  conditions: [] as unknown[],
  blocks: [text(`${kind.toUpperCase()} ${id}`)],
  ...extra,
})

const headerFor = async (path: string) => {
  const { renderChromeTemplates } = await import('@/features/siteTemplates/chrome')
  const { header } = await renderChromeTemplates(path)
  return header === null ? null : renderToStaticMarkup(React.createElement(React.Fragment, null, header))
}
const footerFor = async (path: string) => {
  const { renderChromeTemplates } = await import('@/features/siteTemplates/chrome')
  const { footer } = await renderChromeTemplates(path)
  return footer === null ? null : renderToStaticMarkup(React.createElement(React.Fragment, null, footer))
}

// The first import pulls in the block and element renderers; do it once here, outside the 5 s test limit.
beforeAll(async () => {
  await import('@/features/siteTemplates/chrome')
}, 120_000)

beforeEach(() => {
  state.docs = []
})

describe('requestPathOf', () => {
  it('reads the stripped path from x-pathname first, then next-url', async () => {
    const { requestPathOf } = await import('@/features/siteTemplates/chrome')
    expect(requestPathOf(new Headers({ 'x-pathname': '/shop', 'next-url': '/fr/shop' }))).toBe('/shop')
    expect(requestPathOf(new Headers({ 'next-url': '/shop/silver-ring' }))).toBe('/shop/silver-ring')
  })

  it('drops the query string and the hash from next-url', async () => {
    const { requestPathOf } = await import('@/features/siteTemplates/chrome')
    expect(requestPathOf(new Headers({ 'next-url': '/shop?sort=price&page=2' }))).toBe('/shop')
    expect(requestPathOf(new Headers({ 'next-url': '/blog/post#comments' }))).toBe('/blog/post')
    expect(requestPathOf(new Headers({ 'next-url': '/' }))).toBe('/')
  })

  it('gives an empty path when neither header is set', async () => {
    const { requestPathOf } = await import('@/features/siteTemplates/chrome')
    expect(requestPathOf(new Headers())).toBe('')
  })
})

describe('header and footer by page', () => {
  it('uses the header written for that page, and the everywhere header on other pages', async () => {
    state.docs = [
      template(1, 'header'),
      template(2, 'header', { conditions: [[rule('/shop')]], priority: 5 }),
    ]
    expect(await headerFor('/shop')).toContain('HEADER 2')
    expect(await headerFor('/shop')).not.toContain('HEADER 1')
    expect(await headerFor('/about')).toContain('HEADER 1')
    expect(await headerFor('/about')).not.toContain('HEADER 2')
  })

  it('a page-specific footer does not reach other pages, and the default footer covers the rest', async () => {
    state.docs = [
      template(10, 'footer'),
      template(11, 'footer', { conditions: [[rule('/checkout')]], priority: 9 }),
    ]
    expect(await footerFor('/checkout')).toContain('FOOTER 11')
    expect(await footerFor('/blog')).toContain('FOOTER 10')
    expect(await footerFor('/blog')).not.toContain('FOOTER 11')
  })

  it('gives no header when no header template matches, so the layout draws its own', async () => {
    state.docs = [template(3, 'header', { conditions: [[rule('/shop')]] })]
    expect(await headerFor('/about')).toBeNull()
  })

  it('skips a disabled or empty header even when it is written for the page', async () => {
    state.docs = [
      template(4, 'header', { conditions: [[rule('/shop')]], priority: 99, enabled: false }),
      template(5, 'header', { conditions: [[rule('/shop')]], priority: 98, blocks: [] }),
      template(6, 'header', { priority: 1 }),
    ]
    expect(await headerFor('/shop')).toContain('HEADER 6')
  })

  it('matches the page from next-url in a request, with the query string ignored', async () => {
    state.docs = [template(7, 'header', { conditions: [[rule('/shop')]] }), template(8, 'header')]
    const { requestPathOf, renderChromeTemplates } = await import('@/features/siteTemplates/chrome')
    const path = requestPathOf(new Headers({ 'next-url': '/shop?sort=price' }))
    const { header } = await renderChromeTemplates(path)
    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, header))).toContain('HEADER 7')
  })

  it('a locale page matches its unprefixed path when x-pathname is set', async () => {
    state.docs = [template(9, 'header', { conditions: [[rule('/shop')]] }), template(12, 'header')]
    const { requestPathOf, renderChromeTemplates } = await import('@/features/siteTemplates/chrome')
    const path = requestPathOf(new Headers({ 'x-pathname': '/shop', 'next-url': '/fr/shop' }))
    const { header } = await renderChromeTemplates(path)
    expect(renderToStaticMarkup(React.createElement(React.Fragment, null, header))).toContain('HEADER 9')
  })
})
