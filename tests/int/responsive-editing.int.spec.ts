// @vitest-environment node
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SectionBlock } from '@/components/blocks/SectionBlock'
import {
  asBlockStyle,
  blockStyleClasses,
  blockStyleCss,
  blockStyleToCss,
  resolveDeviceOverride,
  sanitizeDeviceOverride,
  type BlockStyle,
} from '@/lib/blockStyle'
import { columnLayoutStyle, parseSectionLayout, PUBLIC_SECTION_CSS_OPTIONS, sectionLayoutCss, sectionLayoutProps } from '@/lib/sectionLayout'
import { columnWidthVars } from '@/lib/sectionTree'
import { applyColumnOp, buildSectionNode, getColumn, STRUCTURES, structureRects, updateColumnAt } from '@/views/visualEditor/columnOps'
import { makeResponsive } from '@/views/visualEditor/DesignPanel'

const squash = (css: string) => css.replace(/\s+/g, '').replace(/;}/g, '}')
const ids = () => {
  let n = 0
  return () => `id-${n++}`
}

describe('stacked sections size columns by width, not flex-basis (50% looked wrong)', () => {
  const css = squash(sectionLayoutCss(PUBLIC_SECTION_CSS_OPTIONS))

  it('a column in a stacked section gets a width and never a flex-basis percentage', () => {
    const rule = css.match(/\.be-section\[data-dir-d\]\[data-dir-t\]\[data-dir-m="column"\]>\.be-column\{([^}]*)\}/)
    expect(rule?.[1]).toBe('flex-basis:auto;flex-grow:0;width:var(--be-col-m-w,var(--be-col-m,100%));max-width:100%')
    expect(rule?.[1]).not.toContain('-b,')
  })

  it('reads this device first, then the wider devices only while they are stacked too', () => {
    // mobile + tablet + desktop all stacked: the chain walks all three
    expect(css).toContain(
      '[data-dir-d^="column"][data-dir-t^="column"][data-dir-m^="column"]>.be-column{flex-basis:auto;flex-grow:0;width:var(--be-col-m-w,var(--be-col-m,var(--be-col-t-w,var(--be-col-t,var(--be-col-d-w,var(--be-col-d,100%))))));max-width:100%}',
    )
    // mobile stacked on its own (tablet is a row): it must not inherit the desktop width
    const mobileOnly = css.match(/\[data-dir-m="column"\]>\.be-column\{([^}]*)\}/)?.[1] ?? ''
    expect(mobileOnly).not.toContain('--be-col-t')
    expect(mobileOnly).not.toContain('--be-col-d')
  })

  it('every direction rule for a column has the same specificity, so the narrowest device wins by order', () => {
    const selectors = [...css.matchAll(/(\.be-section(?:\[[^\]]+\])+>\.be-column)\{/g)].map((m) => m[1])
    expect(selectors.length).toBeGreaterThan(6)
    const attrs = (sel: string) => (sel.match(/\[/g) || []).length
    expect(new Set(selectors.map(attrs)).size).toBe(1)
  })

  it('a row restored on a narrower device switches width back to auto and the basis back on', () => {
    expect(css).toContain('[data-dir-m="row"]>.be-column{flex-basis:var(--be-col-m-b')
    expect(css).toMatch(/\[data-dir-m="row"\]>\.be-column\{[^}]*width:auto;max-width:none\}/)
  })

  it('auto and fill widths get an explicit stacked width; percentages reuse their own variable', () => {
    expect(columnWidthVars({ widthMobile: { value: 0, unit: 'fill' } })['--be-col-m-w']).toBe('100%')
    expect(columnWidthVars({ widthMobile: { value: 0, unit: 'auto' } })['--be-col-m-w']).toBe('auto')
    const half = columnWidthVars({ widthMobile: { value: 50, unit: 'percent' } })
    expect(half['--be-col-m']).toBe('50%')
    expect(half['--be-col-m-w']).toBeUndefined()
  })

  it('a stacked 50% column is positioned by its align-self (start, centre, end)', () => {
    expect(columnLayoutStyle({ alignSelf: 'center' }).alignSelf).toBe('center')
    expect(columnLayoutStyle({ alignSelf: 'end' }).alignSelf).toBe('flex-end')
    // and the section's align-items is the default for columns without their own
    expect(sectionLayoutProps({ direction: { mobile: 'column' }, alignItems: 'center' }).style.alignItems).toBe('center')
  })

  it('nested columns do not inherit their parent column stacked width', () => {
    expect(css).toContain('--be-col-d-w:initial;--be-col-t-w:initial;--be-col-m-w:initial')
  })

  it('renders the stacked width variables on the column element', () => {
    const html = renderToString(
      React.createElement(SectionBlock, {
        columns: [{ widthDesktop: { value: 50, unit: 'percent' }, widthMobile: { value: 50, unit: 'percent' }, blocks: [] }],
        renderNode: (): null => null,
        design: { layout: { direction: { mobile: 'column' } } },
      }),
    )
    expect(html).toContain('data-dir-m="column"')
    expect(html).toContain('--be-col-m:50%')
  })
})

describe('per-device section flow settings', () => {
  it('writes tablet / mobile wrap, justify and align-items as data attributes', () => {
    const props = sectionLayoutProps({ tablet: { wrap: false, justify: 'center' }, mobile: { alignItems: 'end', wrap: true } })
    expect(props.attrs).toEqual({ 'data-wrap-t': '0', 'data-jc-t': 'center', 'data-ai-m': 'end', 'data-wrap-m': '1' })
  })

  it('the shipped CSS overrides the inline desktop justify with !important inside the media query', () => {
    const css = squash(sectionLayoutCss(PUBLIC_SECTION_CSS_OPTIONS))
    const tablet = css.slice(css.indexOf('@media(max-width:900px)'), css.indexOf('@media(max-width:600px)'))
    expect(tablet).toContain('[data-jc-t="end"]{justify-content:flex-end!important}')
    expect(tablet).toContain('[data-wrap-t="0"]{flex-wrap:nowrap}')
  })

  it('drops junk and keeps vertical align', () => {
    expect(parseSectionLayout({ tablet: { justify: 'sideways' }, verticalAlign: 'middle' })).toEqual({ verticalAlign: 'middle' })
    expect(sectionLayoutProps({ verticalAlign: 'bottom' }).style.alignContent).toBe('flex-end')
  })

  it('column gap between blocks makes the column a flex stack', () => {
    expect(columnLayoutStyle({ gap: 12 })).toMatchObject({ display: 'flex', flexDirection: 'column', gap: '12px' })
  })
})

describe('tablet / mobile style overrides', () => {
  it('sanitises on read: only whitelisted, well typed keys survive', () => {
    expect(
      sanitizeDeviceOverride({ paddingTop: 12, bgColor: 'red', textAlign: 'justify', minHeight: -3, hide: true, selfWidth: 'custom', selfWidthPercent: 60 }),
    ).toEqual({ paddingTop: 12, hide: true, selfWidth: 'custom', selfWidthPercent: 60 })
    expect(sanitizeDeviceOverride('x')).toBeUndefined()
    expect(sanitizeDeviceOverride({ nope: 1 })).toBeUndefined()
    const style = asBlockStyle({ paddingTop: 4, mobile: { paddingTop: 2, color: 'red' }, tablet: 'bad' })
    expect(style.mobile).toEqual({ paddingTop: 2 })
    expect(style.tablet).toBeUndefined()
    expect(style.paddingTop).toBe(4)
  })

  it('leaves a style without overrides untouched (same object)', () => {
    const value = { paddingTop: 4 }
    expect(asBlockStyle(value)).toBe(value)
  })

  it('emits tablet then mobile media rules at the section breakpoints, desktop stays inline', () => {
    const style: BlockStyle = { paddingTop: 80, tablet: { paddingTop: 40, textAlign: 'center' }, mobile: { paddingTop: 16, paddingLeft: 8 } }
    expect(blockStyleToCss(style).paddingTop).toBe('80px')
    const css = blockStyleCss(style, 'x')
    expect(css).toContain('@media (max-width:900px){#x{padding-top:40px !important;text-align:center !important}}')
    expect(css).toContain('@media (max-width:600px){#x{padding-top:16px !important;padding-left:8px !important}}')
    expect(css.indexOf('max-width:900px')).toBeLessThan(css.indexOf('max-width:600px'))
  })

  it('hide applies to that device only; the canvas fades instead of removing', () => {
    const style: BlockStyle = { tablet: { hide: true }, mobile: { hide: true } }
    const css = blockStyleCss(style, 'x')
    expect(css).toContain('@media (min-width:601px) and (max-width:900px){#x{display:none !important}}')
    expect(css).toContain('@media (max-width:600px){#x{display:none !important}}')
    expect(blockStyleCss(style, 'x', { editor: true })).toContain('opacity:0.3 !important')
    expect(blockStyleCss(style, 'x', { editor: true })).not.toContain('display:none')
  })

  it('fit-to-screen is a vh minimum height and works per device', () => {
    expect(blockStyleToCss({ minHeight: 100, minHeightUnit: 'vh' }).minHeight).toBe('100vh')
    expect(blockStyleToCss({ minHeight: 300 }).minHeight).toBe('300px')
    expect(blockStyleCss({ mobile: { minHeight: 100, minHeightUnit: 'vh' } }, 'x')).toContain('min-height:100vh !important')
    expect(blockStyleClasses({ mobile: { minHeight: 200 } })).toContain('be-block--minh')
  })

  it('element position keys recompute width and margins from the merged style', () => {
    const style: BlockStyle = { selfWidth: 'custom', selfWidthPercent: 50, selfAlign: 'center', mobile: { selfWidth: 'full', selfAlign: 'stretch' } }
    const css = blockStyleCss(style, 'x')
    expect(css).toContain('width:100% !important')
    expect(css).toContain('margin-left:0 !important')
  })

  it('older mobile keys keep their exact old rules and read as mobile overrides', () => {
    const legacy: BlockStyle = { paddingTopMobile: 24, hideOnMobile: true }
    expect(blockStyleCss(legacy, 'x')).toBe('@media (max-width:768px){#x{padding-top:24px;display:none}}')
    expect(resolveDeviceOverride(legacy, 'mobile')).toEqual({ paddingTop: 24, hide: true })
    expect(resolveDeviceOverride({ ...legacy, mobile: { paddingTop: 5 } }, 'mobile')).toEqual({ paddingTop: 5, hide: true })
    expect(resolveDeviceOverride(legacy, 'tablet')).toEqual({})
  })

  it('renders per-column overrides on the public section', () => {
    const html = renderToString(
      React.createElement(SectionBlock, {
        columns: [{ design: { mobile: { paddingTop: 10 } }, blocks: [] }, { design: {}, blocks: [] }],
        renderNode: (): null => null,
        scope: 'a',
      }),
    )
    expect(html).toContain('@media (max-width:600px){#be-c-a-0{padding-top:10px !important}}')
    expect(html).toContain('id="be-c-a-0"')
    expect(html).not.toContain('be-c-a-1')
  })
})

describe('responsive controls (device-aware editing)', () => {
  const run = (value: BlockStyle, device: 'desktop' | 'tablet' | 'mobile') => {
    let result: BlockStyle = value
    const ctl = makeResponsive(value, (next) => (result = next), device)
    return { ctl, get: () => result }
  }

  it('desktop edits the base style', () => {
    const { ctl, get } = run({}, 'desktop')
    ctl.set('paddingTop', 30)
    expect(get()).toEqual({ paddingTop: 30 })
    ctl.set('hide', true)
    expect(get().hideOnDesktop).toBe(true)
  })

  it('mobile writes into the mobile override and reports the inherited value', () => {
    const { ctl, get } = run({ paddingTop: 80, tablet: { paddingTop: 40 } }, 'mobile')
    expect(ctl.inherited('paddingTop')).toBe(40)
    expect(ctl.own('paddingTop')).toBeUndefined()
    ctl.set('paddingTop', 10)
    expect(get()).toEqual({ paddingTop: 80, tablet: { paddingTop: 40 }, mobile: { paddingTop: 10 } })
  })

  it('reset returns to inherit and removes empty override objects', () => {
    const { ctl, get } = run({ tablet: { paddingTop: 40 } }, 'tablet')
    expect(ctl.overridden('paddingTop')).toBe(true)
    ctl.reset('paddingTop')
    expect(get()).toEqual({})
  })

  it('an older paddingTopMobile shows as the mobile value and is dropped when edited or reset', () => {
    const { ctl, get } = run({ paddingTopMobile: 24, paddingBottomMobile: 6 }, 'mobile')
    expect(ctl.own('paddingTop')).toBe(24)
    ctl.reset('paddingTop')
    expect(get()).toEqual({ paddingBottomMobile: 6 })
  })

  it('setMany applies several keys from one starting value', () => {
    const { ctl, get } = run({}, 'tablet')
    ctl.setMany({ minHeight: 100, minHeightUnit: 'vh' })
    expect(get()).toEqual({ tablet: { minHeight: 100, minHeightUnit: 'vh' } })
  })
})

describe('structure presets and column operations', () => {
  it('offers the Elementor structures with the right desktop spans', () => {
    const byId = Object.fromEntries(STRUCTURES.map((s) => [s.id, s.widths]))
    expect(byId.one).toEqual([12])
    expect(byId.two).toEqual([6, 6])
    expect(byId['third-twothirds']).toEqual([4, 8])
    expect(byId['twothirds-third']).toEqual([8, 4])
    expect(byId.three).toEqual([4, 4, 4])
    expect(byId.four).toEqual([3, 3, 3, 3])
    expect(byId['quarter-half-quarter']).toEqual([3, 6, 3])
    expect(byId.rows).toEqual([12, 12])
  })

  it('draws two stacked rows as two full-width rectangles', () => {
    const rects = structureRects([12, 12])
    expect(rects).toHaveLength(2)
    expect(rects[0].w).toBe(rects[1].w)
    expect(rects[1].y).toBeGreaterThan(rects[0].y)
    expect(structureRects([6, 6])[1].x).toBeGreaterThan(structureRects([6, 6])[0].x)
  })

  it('builds a section with those column widths', () => {
    const node = buildSectionNode([4, 8], ids())
    expect(node.blockType).toBe('section')
    expect(node.columns?.map((c) => c.widthDesktop)).toEqual([
      { value: 4, unit: 'fraction' },
      { value: 8, unit: 'fraction' },
    ])
  })

  const tree = () => [
    {
      blockType: 'section',
      _id: 's',
      columns: [
        { _id: 'a', widthDesktop: { value: 6, unit: 'fraction' as const }, blocks: [{ blockType: 'element', _id: 'e1' }] },
        { _id: 'b', widthDesktop: { value: 6, unit: 'fraction' as const }, blocks: [] },
      ],
    },
  ]

  it('adds, duplicates (fresh ids), deletes and moves columns and keeps the selection on the right column', () => {
    const makeId = ids()
    const added = applyColumnOp(tree(), [0, 0], 'add', makeId)!
    expect(added.blocks[0].columns).toHaveLength(3)
    expect(added.selectedPath).toEqual([0, 1])

    const dup = applyColumnOp(tree(), [0, 0], 'duplicate', makeId)!
    expect(dup.blocks[0].columns?.[1].blocks?.[0]._id).not.toBe('e1')
    expect(dup.selectedPath).toEqual([0, 1])

    const moved = applyColumnOp(tree(), [0, 0], 'moveRight', makeId)!
    expect(moved.blocks[0].columns?.map((c) => c._id)).toEqual(['b', 'a'])
    expect(moved.selectedPath).toEqual([0, 1])
    expect(applyColumnOp(tree(), [0, 0], 'moveLeft', makeId)).toBeNull()

    const removed = applyColumnOp(tree(), [0, 1], 'delete', makeId)!
    expect(removed.blocks[0].columns?.map((c) => c._id)).toEqual(['a'])
    expect(applyColumnOp(removed.blocks, [0, 0], 'delete', makeId)).toBeNull()
  })

  it('works on a column of a nested (inner) section', () => {
    const outer = tree()
    outer[0].columns[1].blocks = [buildSectionNode([6, 6], ids()) as never]
    const result = applyColumnOp(outer as never, [0, 1, 0, 0], 'add', ids())!
    expect(getColumn(result.blocks, [0, 1, 0, 1])).toBeDefined()
    expect((result.blocks[0].columns?.[1].blocks?.[0].columns || []).length).toBe(3)
  })

  it('updates one column in place', () => {
    const next = updateColumnAt(tree() as never, [0, 1], (c) => ({ ...c, layout: { grow: 1 } }))
    expect(getColumn(next, [0, 1])?.layout).toEqual({ grow: 1 })
    expect(getColumn(next, [0, 0])?.layout).toBeUndefined()
  })
})
