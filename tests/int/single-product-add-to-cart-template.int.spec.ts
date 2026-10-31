// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// React's cache() only keeps a value inside a server request. The block context is set and read across calls here,
// so cache() memoises for the whole file and each test sets the context it needs.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()
    return (...args: A): R => {
      const key = JSON.stringify(args)
      if (!memo.has(key)) memo.set(key, fn(...args))
      return memo.get(key) as R
    }
  }
  return { ...actual, default: { ...actual, cache }, cache }
})

import { setBlockContext } from '@/lib/blockContext'

const state = vi.hoisted(() => ({
  template: null as null | { id: number; kind: string; blocks: Array<Record<string, unknown>> },
  addItem: null as null | ReturnType<typeof vi.fn>,
}))

// The cart hook needs the cart provider; the render test only needs its shape.
vi.mock('@/engine/commerce/react', () => ({
  useCart: () => ({ cart: null as unknown, isLoading: false, addItem: state.addItem ?? vi.fn(), incrementItem: vi.fn(), decrementItem: vi.fn(), removeItem: vi.fn() }),
}))

vi.mock('@/features/siteTemplates/resolve', () => ({
  resolveSiteTemplate: async (kind: string) => (state.template && state.template.kind === kind ? state.template : null),
  prepareTemplateBlocks: async (template: { blocks: unknown[] }) => template.blocks,
}))

// Element blocks are drawn as a marker that carries their type and props, so the test can see what the template placed.
vi.mock('@/components/blocks/BlockRenderer', async () => {
  const R = await import('react')
  const Block = ({ block }: { block: { blockType: string; elementType?: string; props?: Record<string, unknown>; text?: string } }) =>
    block.blockType === 'element'
      ? R.createElement('div', { 'data-el': block.elementType, 'data-props': JSON.stringify(block.props ?? {}) })
      : R.createElement('p', null, block.text)
  return { BlockRenderer: Block }
})

const addToCartBlock = (props: Record<string, unknown> = {}) => ({ blockType: 'element', elementType: 'add-to-cart', props })
const content = React.createElement('main', null, 'PRODUCT DETAIL')

beforeEach(() => {
  state.template = null
  state.addItem = vi.fn()
  setBlockContext({ product: { id: 41, title: 'Silver ring', inventory: 5 } })
})

describe('add to cart inside a single product template', () => {
  it('renders the add to cart button for the product on the page', async () => {
    const { AddToCartElement } = await import('@/components/blocks/elements/Wave66Server')
    const markup = renderToStaticMarkup((await AddToCartElement({})) as React.ReactElement)
    expect(markup).toContain('<button type="button" class="btn btn--primary"')
    expect(markup).toContain('Add to cart')
    expect(markup).not.toContain('disabled')
  })

  it('uses the label the template block sets', async () => {
    const { AddToCartElement } = await import('@/components/blocks/elements/Wave66Server')
    const markup = renderToStaticMarkup((await AddToCartElement({ label: 'Buy now' })) as React.ReactElement)
    expect(markup).toContain('Buy now')
  })

  it('disables the button with an out of stock label when the page product has no stock', async () => {
    setBlockContext({ product: { id: 41, inventory: 0 } })
    const { AddToCartElement } = await import('@/components/blocks/elements/Wave66Server')
    const markup = renderToStaticMarkup((await AddToCartElement({})) as React.ReactElement)
    expect(markup).toContain('Out of stock')
    expect(markup).toContain('disabled')
  })

  it('adds the page product unless the block names another product id', async () => {
    const { AddToCartElement } = await import('@/components/blocks/elements/Wave66Server')
    const own = (await AddToCartElement({})) as React.ReactElement<{ productId: number }>
    const named = (await AddToCartElement({ productId: 99 })) as React.ReactElement<{ productId: number }>
    expect(own.props.productId).toBe(41)
    expect(named.props.productId).toBe(99)
  })

  it('renders nothing with no product on the page and no product id in the block', async () => {
    setBlockContext({})
    const { AddToCartElement } = await import('@/components/blocks/elements/Wave66Server')
    expect(await AddToCartElement({})).toBeNull()
  })

  it('places the add to cart block in the single product template, with the product on the page', async () => {
    state.template = { id: 3, kind: 'single-product', blocks: [{ blockType: 'text', text: 'Before' }, addToCartBlock({ label: 'Add to cart' }), { blockType: 'text', text: 'After' }] }
    const { renderWithTemplate } = await import('@/features/siteTemplates/render')
    const out = renderToStaticMarkup(React.createElement(React.Fragment, null, await renderWithTemplate({ kind: 'single-product', ctx: { productCategory: 'jewellery' }, content })))
    expect(out).toContain('data-template-kind="single-product"')
    expect(out).toContain('data-el="add-to-cart"')
    expect(out).toContain('{&quot;label&quot;:&quot;Add to cart&quot;}')
    expect(out.indexOf('Before')).toBeLessThan(out.indexOf('add-to-cart'))
    // A template without a content slot keeps the product detail after its own blocks.
    expect(out.indexOf('add-to-cart')).toBeLessThan(out.indexOf('PRODUCT DETAIL'))
  })

  it('does not place the block in a different template kind', async () => {
    state.template = { id: 3, kind: 'single-product', blocks: [addToCartBlock()] }
    const { renderWithTemplate } = await import('@/features/siteTemplates/render')
    const out = renderToStaticMarkup(React.createElement(React.Fragment, null, await renderWithTemplate({ kind: 'single-post', ctx: {}, content })))
    expect(out).not.toContain('add-to-cart')
    expect(out).toContain('PRODUCT DETAIL')
  })
})
