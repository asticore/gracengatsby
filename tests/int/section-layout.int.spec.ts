// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionBlock } from '@/components/blocks/SectionBlock'
import { blockStyleToCss } from '@/lib/blockStyle'
import {
  columnLayoutStyle,
  gridStyle,
  modalStyleVars,
  parseSectionLayout,
  percentBasisWithGap,
  PUBLIC_SECTION_CSS_OPTIONS,
  resolveDirections,
  sectionLayoutCss,
  sectionLayoutProps,
} from '@/lib/sectionLayout'
import { columnWidthVars } from '@/lib/sectionTree'
import { CANVAS_SECTION_LAYOUT_CSS } from '@/views/visualEditor/visualEditor.styles'

const squash = (css: string) => css.replace(/\s+/g, '').replace(/;}/g, '}')

describe('two 50% columns share one row (bug: they stacked)', () => {
  it('gives percent columns a gap-compensated basis so 2 x 50% + gap fits', () => {
    const vars = columnWidthVars({ widthDesktop: { value: 50, unit: 'percent' } })
    expect(vars['--be-col-d']).toBe('50%')
    expect(vars['--be-col-d-b']).toBe('calc(50% - var(--be-gap, 0px) * 0.5 - 0.1px)')
  })

  it('shares of the gap add up: n columns subtract (n-1) gaps in total', () => {
    const share = (p: number) => 1 - p / 100
    expect(share(50) * 2).toBeCloseTo(1) // one gap between two columns
    expect(share(100 / 3) * 3).toBeCloseTo(2) // two gaps between three
    expect(percentBasisWithGap(100)).toBeUndefined()
  })

  it('fraction widths are treated the same as percent', () => {
    expect(columnWidthVars({ width: 6 })['--be-col-d-b']).toContain('calc(50%')
    expect(columnWidthVars({ width: 12 })['--be-col-d-b']).toBeUndefined()
  })

  it('basis chain in the shipped CSS reads the compensated value before the plain one', () => {
    const css = squash(sectionLayoutCss(PUBLIC_SECTION_CSS_OPTIONS))
    expect(css).toContain('flex-basis:var(--be-col-d-b,var(--be-col-d,100%))')
    expect(css).not.toContain('max-width:var(--be-col-d')
  })
})

describe('section layout markup data', () => {
  it('emits nothing for a section with no layout (defaults unchanged)', () => {
    expect(sectionLayoutProps(undefined)).toEqual({ className: '', attrs: {}, style: {} })
    expect(sectionLayoutProps({})).toEqual({ className: '', attrs: {}, style: {} })
    expect(sectionLayoutProps({ direction: { desktop: 'row' } }).attrs).toEqual({})
  })

  it('resolves direction per device with desktop -> tablet -> mobile fallback', () => {
    expect(resolveDirections({ direction: { mobile: 'column' } })).toEqual({ desktop: 'row', tablet: 'row', mobile: 'column' })
    expect(resolveDirections({ direction: { desktop: 'row-reverse', tablet: 'column' } })).toEqual({
      desktop: 'row-reverse',
      tablet: 'column',
      mobile: 'column',
    })
  })

  it('writes resolved direction, wrap, gap, justify and align as data', () => {
    const props = sectionLayoutProps({
      direction: { desktop: 'row-reverse', mobile: 'column' },
      wrap: false,
      gap: { desktop: 8, mobile: 40 },
      justify: 'between',
      alignItems: 'center',
      contentWidth: 'boxed',
      boxedWidth: 900,
    })
    expect(props.attrs).toEqual({ 'data-dir-d': 'row-reverse', 'data-dir-t': 'row-reverse', 'data-dir-m': 'column', 'data-nowrap': '1' })
    expect(props.style).toMatchObject({
      '--be-gap-d': '8px',
      '--be-gap-m': '40px',
      justifyContent: 'space-between',
      alignItems: 'center',
      '--be-boxed': '900px',
    })
    expect(props.className).toBe('be-section--boxed')
  })

  it('ignores junk', () => {
    expect(parseSectionLayout({ direction: { desktop: 'sideways' }, gap: { desktop: -4 }, justify: 'x' })).toBeUndefined()
    expect(parseSectionLayout('nope')).toBeUndefined()
  })

  it('renders onto the section element', () => {
    const html = renderToString(
      React.createElement(SectionBlock, {
        columns: [{ widthDesktop: { value: 50, unit: 'percent' }, blocks: [] }, { widthDesktop: { value: 50, unit: 'percent' }, blocks: [] }],
        renderNode: (): null => null,
        design: { layout: { direction: { mobile: 'column' } } },
      }),
    )
    expect(html).toContain('data-dir-m="column"')
    expect(html).toContain('--be-col-d-b:calc(50%')
    const plain = renderToString(
      React.createElement(SectionBlock, { columns: [{ blocks: [] }], renderNode: (): null => null }),
    )
    expect(plain).not.toContain('data-dir')
    expect(plain).toContain('class="be-section"')
  })
})

describe('grid and popup display modes', () => {
  it('parses grid keys, clamps junk and writes the custom properties with defaults', () => {
    expect(parseSectionLayout({ display: 'grid', gridColumns: 4, gridColumnsMobile: 2, gridGap: 8, gridAlign: 'center' })).toEqual({
      display: 'grid',
      gridColumns: 4,
      gridColumnsMobile: 2,
      gridGap: 8,
      gridAlign: 'center',
    })
    expect(parseSectionLayout({ display: 'grid', gridColumns: 9, gridGap: -1 })).toEqual({ display: 'grid' })
    expect(gridStyle({ display: 'grid' })).toEqual({ '--be-grid-cols': '3', '--be-grid-cols-m': '1', '--be-grid-gap': '16px', alignItems: 'stretch' })
    expect(gridStyle({ display: 'grid', gridColumnsTablet: 2 })['--be-grid-cols-t']).toBe('2')
    expect(gridStyle({ display: 'tabs', gridColumns: 4 })).toEqual({})
  })

  it('parses popup keys and clamps the width and label', () => {
    expect(parseSectionLayout({ display: 'modal', modalLabel: '  Read more  ', modalWidth: 100, modalStyle: 'link' })).toEqual({
      display: 'modal',
      modalLabel: 'Read more',
      modalStyle: 'link',
    })
    expect(modalStyleVars({ display: 'modal' })).toEqual({ '--be-modal-width': '640px' })
    expect(modalStyleVars({ display: 'modal', modalWidth: 800 })).toEqual({ '--be-modal-width': '800px' })
  })

  it('renders a grid wrapper with columns inside, and a checkbox-driven popup with the columns in its body', () => {
    const columns: { blocks: unknown[] }[] = [{ blocks: [] }, { blocks: [] }]
    const grid =renderToString(React.createElement(SectionBlock, { columns, renderNode: (): null => null, design: { layout: { display: 'grid' } } }))
    expect(grid).toContain('class="be-grid"')
    expect(grid).toContain('--be-grid-cols:3')
    expect(grid.match(/class="be-column/g)?.length).toBe(2)

    const modal = renderToString(
      React.createElement(SectionBlock, {
        columns,
        renderNode: (): null => null,
        design: { layout: { display: 'modal', modalLabel: 'Open terms' } },
        scope: 'x',
      }),
    )
    expect(modal).toContain('class="be-modal__toggle"')
    expect(modal).toContain('<label for="be-x-m" class="be-modal__trigger be-modal__trigger--button">Open terms</label>')
    expect(modal).toContain('role="dialog"')
    expect(modal.match(/class="be-column/g)?.length).toBe(2)
  })
})

describe('column layout', () => {
  it('maps grow, shrink, order, align-self, min-width, padding and vertical alignment', () => {
    const style = columnLayoutStyle({
      grow: 2,
      shrink: 0,
      alignSelf: 'center',
      order: { tablet: 2, mobile: -1 },
      minWidth: 120,
      vAlign: 'middle',
      padding: { top: 10, left: 4 },
    })
    expect(style).toMatchObject({
      '--be-col-grow': '2',
      '--be-col-shrink': '0',
      '--be-col-order-t': '2',
      '--be-col-order-m': '-1',
      alignSelf: 'center',
      minWidth: '120px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      paddingTop: '10px',
      paddingLeft: '4px',
    })
  })

  it('vertical alignment stretches the column unless align-self is set', () => {
    expect(columnLayoutStyle({ vAlign: 'bottom' }).alignSelf).toBe('stretch')
    expect(columnLayoutStyle({})).toEqual({})
  })

  it('supports auto and fill widths, switching grow off for other devices', () => {
    const vars = columnWidthVars({ widthDesktop: { value: 0, unit: 'fill' }, widthMobile: { value: 100, unit: 'percent' } })
    expect(vars['--be-col-d']).toBe('0px')
    expect(vars['--be-col-d-g']).toBe('1')
    expect(vars['--be-col-m-g']).toBe('0')
    expect(columnWidthVars({ widthDesktop: { value: 0, unit: 'auto' } })['--be-col-d']).toBe('auto')
  })

  it('column vars are unchanged for plain widths', () => {
    expect(Object.keys(columnWidthVars({ widthDesktop: { value: 100, unit: 'percent' } }))).toEqual(['--be-col-d'])
  })
})

describe('element position in a column', () => {
  it('does nothing by default', () => {
    expect(blockStyleToCss({})).toEqual({})
  })
  it('aligns with auto margins and explicit margins win', () => {
    expect(blockStyleToCss({ selfAlign: 'center' })).toMatchObject({ width: 'fit-content', marginLeft: 'auto', marginRight: 'auto' })
    expect(blockStyleToCss({ selfAlign: 'end', marginLeft: 12 }).marginLeft).toBe('12px')
    expect(blockStyleToCss({ selfAlign: 'stretch' }).width).toBe('100%')
    expect(blockStyleToCss({ selfWidth: 'custom', selfWidthPercent: 40, selfAlign: 'center' }).width).toBe('40%')
  })
})

describe('generated CSS', () => {
  const css = sectionLayoutCss(PUBLIC_SECTION_CSS_OPTIONS)

  it('orders desktop rules, then tablet, then mobile media queries', () => {
    const t = css.indexOf('@media (max-width:900px)')
    const m = css.indexOf('@media (max-width:600px)')
    expect(css.indexOf('[data-dir-d="column"]')).toBeLessThan(t)
    expect(t).toBeGreaterThan(0)
    expect(m).toBeGreaterThan(t)
    expect(css.indexOf('[data-dir-t="column"]')).toBeGreaterThan(t)
    expect(css.indexOf('[data-dir-m="column"]')).toBeGreaterThan(m)
  })

  it('honours custom breakpoints', () => {
    const custom = sectionLayoutCss({ ...PUBLIC_SECTION_CSS_OPTIONS, breakpoints: { tablet: 1024, mobile: 640 } })
    expect(custom).toContain('@media (max-width:1024px)')
    expect(custom).toContain('@media (max-width:640px)')
  })

  it('supports every direction including the reverse ones', () => {
    for (const dir of ['row', 'row-reverse', 'column', 'column-reverse']) {
      expect(css).toContain(`[data-dir-d="${dir}"]{flex-direction:${dir}}`)
    }
  })

  it('stacked sections size columns by width (not flex-basis, which is height there); row restores the basis', () => {
    expect(css).toContain('[data-dir-m="column"]>.be-column{flex-basis:auto;flex-grow:0;width:var(--be-col-m-w,var(--be-col-m,100%));max-width:100%}')
    expect(css).toMatch(/\[data-dir-m="row"\]>\.be-column\{flex-basis:var\(--be-col-m-b/)
  })

  it('defaults reproduce the previous rendering: wrap row, 24px gap, top aligned', () => {
    expect(css).toContain('display:flex;flex-wrap:wrap;gap:var(--be-gap);align-items:flex-start')
    expect(css).toContain('--be-gap:var(--be-gap-d,24px)')
    expect(css).toContain('--be-gap:var(--be-gap-m,var(--be-gap-t,var(--be-gap-d,24px)))')
  })

  it('ships in styles.css and the canvas, generated from the same function', () => {
    const file = fs.readFileSync(path.join(process.cwd(), 'src/app/(frontend)/styles.css'), 'utf8')
    expect(squash(file)).toContain(squash(css))
    expect(squash(CANVAS_SECTION_LAYOUT_CSS)).toContain('.ve-section{')
    expect(squash(CANVAS_SECTION_LAYOUT_CSS)).toContain('--be-gap:var(--be-gap-d,12px)')
  })
})
