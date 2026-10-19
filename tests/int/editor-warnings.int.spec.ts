import { describe, expect, it } from 'vitest'

import type { SectionNode } from '@/lib/sectionTree'
import { collectWarnings, contrastRatio, indexNodePaths, parseHex } from '@/views/visualEditor/designWarnings'
import { buildCrumbs } from '@/views/visualEditor/SelectionPath'

const heading = (tag: string, id: string): SectionNode => ({
  blockType: 'element',
  elementType: 'heading',
  _id: id,
  props: { tag, text: 'Title' },
})

const section = (id: string, blocks: SectionNode[][] = []): SectionNode => ({
  blockType: 'section',
  _id: id,
  columns: blocks.map((list, i) => ({ _id: `${id}-c${i}`, blocks: list })),
})

describe('designWarnings: colour helpers', () => {
  it('parses 3 and 6 digit hex and rejects everything else', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#102030')).toEqual([16, 32, 48])
    expect(parseHex('var(--ink)')).toBeNull()
    expect(parseHex('linear-gradient(#000, #fff)')).toBeNull()
    expect(parseHex(undefined)).toBeNull()
  })

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5)
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeGreaterThan(4.5)
  })
})

describe('collectWarnings', () => {
  it('flags low text/background contrast only when both colours are plain hex', () => {
    const low: SectionNode = { blockType: 'richText', _id: 'low', design: { bgType: 'color', bgColor: '#ffffff', textColor: '#777' } }
    const ok: SectionNode = { blockType: 'richText', _id: 'ok', design: { bgType: 'color', bgColor: '#ffffff', textColor: '#111' } }
    const token: SectionNode = { blockType: 'richText', _id: 'tok', design: { bgColor: '#ffffff', textColor: 'var(--ink)' } }
    const gradient: SectionNode = {
      blockType: 'richText',
      _id: 'grad',
      design: { bgType: 'gradient', bgColor: '#ffffff', textColor: '#777' },
    }
    const found = collectWarnings([low, ok, token, gradient])
    expect(found.map((w) => w.nodeId)).toEqual(['low'])
    expect(found[0]).toMatchObject({ level: 'warn' })
    expect(found[0].message).toContain('contrast')
  })

  it('flags a heading that skips a level, but not a one-level step', () => {
    const skip = collectWarnings([section('s', [[heading('h2', 'a'), heading('h4', 'b')]])])
    expect(skip).toHaveLength(1)
    expect(skip[0]).toMatchObject({ nodeId: 'b', level: 'warn' })
    expect(skip[0].message).toContain('h2 to h4')

    expect(collectWarnings([section('s', [[heading('h2', 'a'), heading('h3', 'b')]])])).toHaveLength(0)
  })

  it('treats a heading element with no tag as h2', () => {
    const bare: SectionNode = { blockType: 'element', elementType: 'heading', _id: 'bare', props: {} }
    expect(collectWarnings([bare, heading('h4', 'deep')]).map((w) => w.nodeId)).toEqual(['deep'])
  })

  it('flags images over 2 MB only when size is in props, and missing alt text', () => {
    const big: SectionNode = {
      blockType: 'element',
      elementType: 'image',
      _id: 'big',
      props: { image: 7, alt: 'Hero', fileSize: 3 * 1024 * 1024 },
    }
    const noSize: SectionNode = { blockType: 'element', elementType: 'image', _id: 'nosize', props: { image: 8, alt: 'Logo' } }
    const noAlt: SectionNode = { blockType: 'element', elementType: 'image', _id: 'noalt', props: { url: '/a.jpg', alt: '  ' } }
    const found = collectWarnings([big, noSize, noAlt])
    expect(found).toEqual([
      expect.objectContaining({ nodeId: 'big', level: 'warn', message: 'Image is over 2 MB' }),
      expect.objectContaining({ nodeId: 'noalt', level: 'warn', message: 'Image has no alt text' }),
    ])
  })

  it('reports more than 3 heavy effects on one block as info', () => {
    const four: SectionNode = {
      blockType: 'richText',
      _id: 'four',
      design: { bgEffect: 'particles', parallax: 'background', pointerFx: 'tilt', kenBurns: 'zoom-in' },
    }
    const three: SectionNode = {
      blockType: 'richText',
      _id: 'three',
      design: { parallax: 'background', pointerFx: 'tilt', kenBurns: 'pan', bgEffect: 'none' },
    }
    const found = collectWarnings([four, three])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ nodeId: 'four', level: 'info' })
  })

  it('flags a button with a label but no link, and ignores blank labels', () => {
    const empty: SectionNode = { blockType: 'hero', _id: 'hero', primaryCtaLabel: 'Shop', primaryCtaUrl: undefined }
    const linked: SectionNode = { blockType: 'hero', _id: 'linked', primaryCtaLabel: 'Shop', primaryCtaUrl: { url: '/shop' } }
    const blank: SectionNode = { blockType: 'hero', _id: 'blank', primaryCtaLabel: '', primaryCtaUrl: undefined }
    const found = collectWarnings([empty, linked, blank])
    expect(found.map((w) => [w.nodeId, w.message])).toEqual([['hero', 'Button or link has no URL']])
  })

  it('returns nothing for a clean page', () => {
    expect(collectWarnings([section('s', [[heading('h2', 'a'), heading('h3', 'b')]])])).toEqual([])
  })
})

describe('indexNodePaths and buildCrumbs', () => {
  const tree: SectionNode[] = [
    { blockType: 'hero', _id: 'hero' },
    section('sec', [[{ blockType: 'hero', _id: 'nested' }], [heading('h2', 'deep')]]),
  ]

  it('maps node ids to block paths, nested ones included', () => {
    const paths = indexNodePaths(tree)
    expect(paths.get('hero')).toEqual([0])
    expect(paths.get('sec')).toEqual([1])
    expect(paths.get('nested')).toEqual([1, 0, 0])
    expect(paths.get('deep')).toEqual([1, 1, 0])
  })

  it('builds Page > Section > Column > Element crumbs', () => {
    const crumbs = buildCrumbs(tree, [1, 1, 0])
    expect(crumbs.map((c) => c.label)).toEqual(['Page', 'Section', 'Column 2', 'Heading'])
    expect(crumbs.map((c) => c.path)).toEqual([null, [1], [1, 1], [1, 1, 0]])
  })

  it('shows only the page when nothing is selected, and stops at a stale path', () => {
    expect(buildCrumbs(tree, null).map((c) => c.label)).toEqual(['Page'])
    expect(buildCrumbs(tree, [5, 0, 0]).map((c) => c.label)).toEqual(['Page'])
  })
})
