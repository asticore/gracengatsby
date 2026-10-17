// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { asBlockStyle, blockStyleCss, blockStyleToCss, type BlockStyle } from '@/lib/blockStyle'

const HOVER_TRANSITION =
  'background-color 400ms ease, color 400ms ease, border-color 400ms ease, box-shadow 400ms ease, border-radius 400ms ease'

describe('normal | hover state keys: sanitising', () => {
  it('keeps valid hover keys unchanged', () => {
    const input = {
      hoverBgColor: '#ffffff',
      hoverTextColor: 'rgb(1, 2, 3)',
      hoverBorderColor: 'transparent',
      hoverBoxShadow: 'md',
      hoverBorderRadius: 12,
      hoverTransitionMs: 400,
    }
    expect(asBlockStyle(input)).toEqual(input)
  })

  it('drops colours that fail SAFE_COLOR and enums outside the shadow presets', () => {
    const out = asBlockStyle({
      hoverBgColor: 'red;}body{background:url(x)',
      hoverTextColor: 42,
      hoverBorderColor: 'url(javascript:x)}',
      hoverBoxShadow: 'huge',
    })
    expect(out.hoverBgColor).toBeUndefined()
    expect(out.hoverTextColor).toBeUndefined()
    expect(out.hoverBorderColor).toBeUndefined()
    expect(out.hoverBoxShadow).toBeUndefined()
  })

  it('keeps hoverBoxShadow none (it means "no shadow on hover")', () => {
    expect(asBlockStyle({ hoverBoxShadow: 'none' }).hoverBoxShadow).toBe('none')
  })

  it('clamps the numeric hover keys into range', () => {
    const high = asBlockStyle({ hoverBorderRadius: 999, hoverTransitionMs: 99999 })
    expect(high.hoverBorderRadius).toBe(200)
    expect(high.hoverTransitionMs).toBe(2000)
    const low = asBlockStyle({ hoverBorderRadius: -3, hoverTransitionMs: -5 })
    expect(low.hoverBorderRadius).toBe(0)
    expect(low.hoverTransitionMs).toBe(0)
  })
})

describe('normal | hover state CSS', () => {
  it('emits a hover rule inside @media (hover:hover) with !important declarations', () => {
    const style: BlockStyle = {
      hoverBgColor: '#112233',
      hoverTextColor: '#fefefe',
      hoverBorderColor: '#abcdef',
      hoverBoxShadow: 'lg',
      hoverBorderRadius: 8,
    }
    const css = blockStyleCss(style, 'be-block-3')
    expect(css).toContain(
      '@media (hover:hover){#be-block-3:hover{background-color:#112233 !important;color:#fefefe !important;' +
        'border-color:#abcdef !important;box-shadow:0 20px 48px rgba(0, 0, 0, 0.22) !important;border-radius:8px !important}}',
    )
  })

  it('emits box-shadow:none on hover when the hover shadow is none', () => {
    const css = blockStyleCss({ hoverBoxShadow: 'none' }, 'be-block-1')
    expect(css).toContain('@media (hover:hover){#be-block-1:hover{box-shadow:none !important}}')
  })

  it('emits no hover rule when only the transition duration is set', () => {
    expect(blockStyleCss({ hoverTransitionMs: 400 }, 'be-block-1')).toBe('')
  })

  it('adds a transition for the hover properties, using hoverTransitionMs', () => {
    const css = blockStyleToCss({ hoverBgColor: '#fff', hoverTransitionMs: 400 })
    expect(css.transition).toBe(HOVER_TRANSITION)
  })

  it('defaults the hover transition to 250ms', () => {
    const css = blockStyleToCss({ hoverTextColor: '#000' })
    expect(css.transition).toContain('color 250ms ease')
    expect(css.transition).toContain('border-radius 250ms ease')
  })

  it('merges the hover transition with the transform transition into one list', () => {
    const css = blockStyleToCss({ tfRotate: 10, tfDuration: 300, hoverBgColor: '#fff', hoverTransitionMs: 400 })
    expect(css.transition).toBe(`transform 300ms ease, ${HOVER_TRANSITION}`)
    expect(css.transform).toBe('rotate(10deg)')
  })

  it('keeps the transform transition alone when no hover state is set', () => {
    const css = blockStyleToCss({ tfRotate: 10 })
    expect(css.transition).toBe('transform 250ms ease')
  })
})
