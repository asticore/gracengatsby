// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ docs: [] as Array<Record<string, unknown>>, throwOnFind: false, finds: 0, byIds: [] as string[], resets: [] as Array<() => void> }))

// React's cache() only memoises inside a server render; here it memoises until the next test starts.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const cache = <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>()
    state.resets.push(() => memo.clear())
    return (...args: A): R => {
      const key = JSON.stringify(args)
      if (!memo.has(key)) memo.set(key, fn(...args))
      return memo.get(key) as R
    }
  }
  return { ...actual, default: { ...actual, cache }, cache }
})

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    find: async (args: { depth?: number }) => {
      state.finds += 1
      if (state.throwOnFind) throw new Error('db down')
      expect(args.depth).toBe(0)
      return { docs: state.docs.filter((d) => d.enabled !== false) }
    },
    findByID: async ({ id, depth }: { id: number | string; depth: number }) => {
      state.byIds.push(String(id))
      expect(depth).toBe(2)
      return state.docs.find((d) => String(d.id) === String(id)) ?? null
    },
  }),
}))

// The real BlockRenderer pulls in every block component; a small stand-in is enough for slot placement.
vi.mock('@/components/blocks/BlockRenderer', async () => {
  const { renderElement } = await import('@/components/blocks/elements/renderElement')
  const R = await import('react')
  type B = { blockType: string; elementType?: string; text?: string; props?: Record<string, unknown>; columns?: Array<{ blocks?: B[] }> }
  const Block = ({ block }: { block: B }): React.ReactNode =>
    block.blockType === 'element'
      ? R.createElement('div', { 'data-el': block.elementType }, renderElement(block.elementType as string, block.props || {}))
      : block.blockType === 'section'
        ? R.createElement('section', null, (block.columns || []).flatMap((c) => c.blocks || []).map((b, i) => R.createElement(Block, { key: i, block: b })))
        : R.createElement('p', null, block.text)
  return { BlockRenderer: Block }
})

const slotBlock = { blockType: 'element', elementType: 'content-slot', props: {} }
const textBlock = (text: string) => ({ blockType: 'text', text })
const tpl = (id: number, extra: Record<string, unknown> = {}) => ({ id, name: `t${id}`, kind: 'single-post', enabled: true, priority: 10, conditions: [] as unknown[], blocks: [textBlock(`T${id}`)], ...extra })
const rule = (param: string, value: string, operator = 'equals') => ({ param, operator, value })

const load = async () => {
  return {
    resolve: await import('@/features/siteTemplates/resolve'),
    render: await import('@/features/siteTemplates/render'),
    cond: await import('@/features/siteTemplates/conditions'),
  }
}
const html = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const content = React.createElement('main', null, 'PAGE')

beforeEach(() => {
  state.docs = []
  state.throwOnFind = false
  state.finds = 0
  state.byIds = []
  state.resets.forEach((reset) => reset())
})

describe('resolveSiteTemplate', () => {
  it('picks the highest priority, ties to the lowest id', async () => {
    state.docs = [tpl(5, { priority: 20 }), tpl(3, { priority: 20 }), tpl(1, { priority: 5 })]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', {}))?.id).toBe(3)
  })

  it('ignores disabled templates and other kinds', async () => {
    state.docs = [tpl(1, { enabled: false, priority: 99 }), tpl(2, { kind: 'footer', priority: 99 }), tpl(3)]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', {}))?.id).toBe(3)
    expect(await resolve.resolveSiteTemplate('header', {})).toBeNull()
  })

  it('empty conditions match, OR groups and AND rules work', async () => {
    state.docs = [
      tpl(1, { priority: 1 }),
      tpl(2, { priority: 5, conditions: [[rule('postCategory', 'News'), rule('path', '/blog/a')], [rule('postCategory', 'Offers')]] }),
    ]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', { postCategories: ['News'], path: '/blog/a' }))?.id).toBe(2)
    expect((await resolve.resolveSiteTemplate('single-post', { postCategories: ['News'], path: '/blog/b' }))?.id).toBe(1)
    expect((await resolve.resolveSiteTemplate('single-post', { postCategories: ['Offers'] }))?.id).toBe(2)
  })

  it('array params match when any value equals, notEquals negates', async () => {
    state.docs = [
      tpl(1, { kind: 'single-product', conditions: [[rule('productCategory', 'jewellery')]] }),
      tpl(2, { kind: 'single-product', priority: 1, conditions: [[rule('productType', 'bundle', 'notEquals')]] }),
    ]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-product', { productCategory: ['homeware', 'jewellery'], productType: 'bundle' }))?.id).toBe(1)
    expect(await resolve.resolveSiteTemplate('single-product', { productCategory: 'homeware', productType: 'bundle' })).toBeNull()
  })

  it('sets templateKind itself', async () => {
    state.docs = [tpl(1, { conditions: [[rule('templateKind', 'single-post')]] })]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', {}))?.id).toBe(1)
  })

  it('returns null when loading throws', async () => {
    state.docs = [tpl(1)]
    state.throwOnFind = true
    const { resolve } = await load()
    expect(await resolve.loadSiteTemplateIndex()).toEqual([])
    expect(await resolve.resolveSiteTemplate('single-post', {})).toBeNull()
  })
})

describe('sanitizeConditions', () => {
  it('fails closed on hostile or partly invalid input', async () => {
    const { cond } = await load()
    for (const bad of [5, 'x', '{', {}, [1, null, 'a'], [[null, 3, { param: 1 }]], [[rule('collection', 'x')]], [[rule('path', '/a'), { param: 'path', operator: 'contains', value: 'x' }]], [[rule('path', '/a')], []], [[rule('path', 5 as never)]]]) {
      expect(cond.sanitizeConditions(bad)).toEqual({ groups: [], valid: false })
    }
    expect(cond.sanitizeConditions('[[{"param":"path","operator":"equals","value":"/a"}]]')).toEqual({ groups: [[rule('path', '/a')]], valid: true })
  })

  it('treats empty as valid and everywhere', async () => {
    const { cond } = await load()
    for (const empty of [null as unknown, undefined, [], [[]], '[]', '']) expect(cond.sanitizeConditions(empty)).toEqual({ groups: [], valid: true })
  })

  it('rejects over-cap input instead of truncating', async () => {
    const { cond } = await load()
    expect(cond.sanitizeConditions(Array.from({ length: 11 }, () => [rule('path', 'x')])).valid).toBe(false)
    expect(cond.sanitizeConditions([Array.from({ length: 11 }, () => rule('path', 'x'))]).valid).toBe(false)
    expect(cond.sanitizeConditions([[rule('path', 'x'.repeat(201))]]).valid).toBe(false)
    expect(cond.sanitizeConditions([[rule('path', 'x'.repeat(200))]]).valid).toBe(true)
  })
})

describe('resolve safety and cost', () => {
  it('never matches a template with an invalid condition, even when higher priority', async () => {
    state.docs = [tpl(1, { priority: 99, conditions: [[rule('postCategory', 'News'), { param: 'bogus', operator: 'equals', value: 'x' }]] }), tpl(2, { priority: 1 })]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', { postCategories: ['News'] }))?.id).toBe(2)
  })

  it('ignores empty templates so they cannot shadow a valid one', async () => {
    state.docs = [tpl(1, { priority: 99, blocks: [] }), tpl(2, { priority: 1 })]
    const { resolve } = await load()
    expect((await resolve.resolveSiteTemplate('single-post', {}))?.id).toBe(2)
  })

  it('costs one index query and one document load for the winner', async () => {
    state.docs = [tpl(1, { priority: 1 }), tpl(2, { priority: 9 }), tpl(3, { kind: 'footer' })]
    const { resolve } = await load()
    await resolve.resolveSiteTemplate('single-post', {})
    await resolve.resolveSiteTemplate('single-post', {})
    await resolve.resolveSiteTemplate('footer', {})
    expect(state.finds).toBe(1)
    expect(state.byIds.filter((id) => id === '2')).toHaveLength(1)
    expect(state.byIds).toEqual(['2', '3'])
  })
})

describe('chrome templates', () => {
  it('strips content-slot elements at top level and in nested sections', async () => {
    const { stripContentSlots } = await import('@/features/siteTemplates/chrome')
    const nested = { blockType: 'section', columns: [{ blocks: [slotBlock, { blockType: 'section', columns: [{ blocks: [slotBlock, textBlock('keep')] }] }] }] }
    const out = stripContentSlots([slotBlock, textBlock('a'), nested])
    const render = await load()
    expect(render.render.hasContentSlot(out)).toBe(false)
    expect(JSON.stringify(out)).toContain('keep')
    expect(out).toHaveLength(2)
  })
})

describe('renderWithTemplate', () => {
  it('returns content untouched when no template matches', async () => {
    const { render } = await load()
    expect(await render.renderWithTemplate({ kind: 'single-post', ctx: {}, content })).toBe(content)
  })

  it('puts the content inside the slot element', async () => {
    state.docs = [tpl(1, { blocks: [textBlock('TOP'), { blockType: 'section', columns: [{ blocks: [slotBlock] }] }, textBlock('BOTTOM')] })]
    const { render } = await load()
    const out = html(await render.renderWithTemplate({ kind: 'single-post', ctx: {}, content }))
    expect(out).toContain('TOP')
    expect(out.match(/PAGE/g)).toHaveLength(1)
    expect(out.indexOf('TOP')).toBeLessThan(out.indexOf('PAGE'))
    expect(out.indexOf('PAGE')).toBeLessThan(out.indexOf('BOTTOM'))
  })

  it('appends the content after a template with no slot', async () => {
    state.docs = [tpl(1, { blocks: [textBlock('TOP')] })]
    const { render } = await load()
    const out = html(await render.renderWithTemplate({ kind: 'single-post', ctx: {}, content }))
    expect(out.indexOf('TOP')).toBeLessThan(out.indexOf('PAGE'))
    expect(out.match(/PAGE/g)).toHaveLength(1)
  })

  it('returns content on error', async () => {
    state.docs = [tpl(1, { blocks: [slotBlock] })]
    const { render } = await load()
    const bad = { kind: 'single-post', get ctx(): never { throw new Error('boom') }, content } as never
    expect(await render.renderWithTemplate(bad)).toBe(content)
  })

  it('hasContentSlot walks nested sections', async () => {
    const { render } = await load()
    const nested = { blockType: 'section', columns: [{ blocks: [{ blockType: 'section', columns: [{ blocks: [slotBlock] }] }] }] }
    expect(render.hasContentSlot([nested])).toBe(true)
    expect(render.hasContentSlot([textBlock('x'), null, 3])).toBe(false)
  })
})
