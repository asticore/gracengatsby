import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { asBlockStyle, blockStyleClasses, blockStyleCss, blockStyleToCss, type BlockStyle } from '@/lib/blockStyle'
import { readFlatDesign } from '@/lib/design/upgrade'
import { upgradeV1 } from '@/lib/design/upgradeV1'
import { withElementDesign } from '@/components/blocks/elements/renderElement'
import { StyledBlock as StyledBlockProps } from '@/components/blocks/StyledBlock'
import { TEMPLATE_PRESETS } from '@/views/visualEditor/templatePresets'

/**
 * The real render path: stored value -> asBlockStyle (the read every renderer
 * uses) -> v1 render functions. A grouped value (step 2 storage) must give the
 * same result as the flat v1 value it came from, for every design in the
 * template presets and for a design with hover, reveal, effects and overrides.
 */

type Rec = Record<string, unknown>

// StyledBlock declares children as required; the test passes them as the element's child argument.
const StyledBlock = StyledBlockProps as unknown as React.FC<{ style: unknown; index: number; children?: React.ReactNode }>

function collectDesigns(node: unknown, out: BlockStyle[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDesigns(item, out)
    return
  }
  if (!node || typeof node !== 'object') return
  const rec = node as Rec
  if (rec.design && typeof rec.design === 'object' && !Array.isArray(rec.design)) out.push(rec.design as BlockStyle)
  if ('columns' in rec) collectDesigns(rec.columns, out)
  if ('blocks' in rec) collectDesigns(rec.blocks, out)
}

const designs: BlockStyle[] = []
for (const preset of TEMPLATE_PRESETS) collectDesigns(preset.blocks(), designs)
designs.push({
  hover: 'lift',
  hoverLift: 8,
  reveal: 'fade-up',
  revealDistance: 30,
  bgEffect: 'grid',
  gridSize: 40,
  paddingTop: 10,
  paddingUnit: 'em',
  tablet: { paddingTop: 4 },
  mobile: { hide: true },
  fontSize: 20,
  fontSizeUnit: 'px',
  customCss: 'selector p { color: red; }',
})

const paths = (raw: unknown) => {
  const style = asBlockStyle(raw)
  return { inline: blockStyleToCss(style), css: blockStyleCss(style, 'scope-x'), classes: blockStyleClasses(style) }
}

describe('render path: grouped values render as their v1 source', () => {
  it('asBlockStyle gives the same style for a grouped value as for the v1 source', () => {
    for (const design of designs) {
      expect(asBlockStyle(upgradeV1(design as Rec))).toEqual(asBlockStyle(design))
    }
  })

  it('the CSS, inline styles and classes are identical for the grouped and the flat value', () => {
    for (const design of designs) {
      expect(paths(upgradeV1(design as Rec))).toEqual(paths(design))
    }
  })

  it('readFlatDesign returns the stored v1 value exactly', () => {
    for (const design of designs) {
      expect(readFlatDesign(design)).toEqual(JSON.parse(JSON.stringify(design)))
    }
  })

  it('typed v2 values with no groups read as empty for the v1 path', () => {
    const typed = { schemaVersion: 2, color: { text: { desktop: { normal: '#111' } } } }
    expect(readFlatDesign(typed)).toEqual({})
    expect(asBlockStyle(typed)).toEqual({})
  })

  it('element wrapper emits no typed CSS for a grouped value (the v1 wrapper renders it)', () => {
    const grouped = upgradeV1({ paddingTop: 20, hover: 'lift' } as Rec)
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, withElementDesign(React.createElement('span', null, 'x'), grouped, 'scope-x')))
    expect(html).toBe('<span>x</span>')
  })

  it('StyledBlock renders a grouped value with the same markup as its v1 source', () => {
    for (const design of designs.slice(0, 12)) {
      const fromV1 = renderToStaticMarkup(React.createElement(StyledBlock, { style: design, index: 0 }, 'body'))
      const fromGrouped = renderToStaticMarkup(React.createElement(StyledBlock, { style: upgradeV1(design as Rec), index: 0 }, 'body'))
      expect(fromV1).toContain('body')
      expect(fromGrouped).toBe(fromV1)
    }
  })
})
