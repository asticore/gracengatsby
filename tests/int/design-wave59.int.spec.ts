import { describe, expect, it } from 'vitest'

import {
  asBlockStyle,
  blockFontStack,
  blockStyleCss,
  blockStyleToCss,
  FONT_TOKEN_OPTIONS,
  sanitizeDeviceOverride,
  type BlockStyle,
} from '@/lib/blockStyle'
import { GROUP_KEYS, groupModified, resetGroup } from '@/views/visualEditor/designHelpers'

describe('wave 59: per-corner radius', () => {
  it('emits a four-value border-radius when any corner is set', () => {
    const css = blockStyleToCss({ radiusTl: 10, radiusBr: 20 })
    expect(css.borderRadius).toBe('10px 0px 20px 0px')
  })

  it('unset corners fall back to borderRadius', () => {
    const css = blockStyleToCss({ borderRadius: 8, radiusTr: 30 })
    expect(css.borderRadius).toBe('8px 30px 8px 8px')
  })

  it('keeps plain borderRadius when no corner is set', () => {
    expect(blockStyleToCss({ borderRadius: 12 }).borderRadius).toBe('12px')
    expect(blockStyleToCss({}).borderRadius).toBeUndefined()
  })

  it('sanitizer clamps corners and drops junk', () => {
    const s = asBlockStyle({ radiusTl: -5, radiusTr: 5000, radiusBr: 'x', radiusBl: 7, radiusLinked: 'yes' })
    expect(s.radiusTl).toBe(0)
    expect(s.radiusTr).toBe(999)
    expect(s.radiusBr).toBeUndefined()
    expect(s.radiusBl).toBe(7)
    expect(s.radiusLinked).toBeUndefined()
    expect(asBlockStyle({ radiusLinked: true }).radiusLinked).toBe(true)
  })

  it('device overrides keep and clamp corners', () => {
    expect(sanitizeDeviceOverride({ radiusTl: 4, radiusTr: 'a', radiusBl: 2000 })).toEqual({ radiusTl: 4, radiusBl: 999 })
  })

  it('emits per-device border-radius in the stylesheet', () => {
    const style: BlockStyle = { borderRadius: 6, mobile: { radiusTl: 0, radiusTr: 24 } }
    const css = blockStyleCss(style, 'b1')
    expect(css).toContain('border-radius:0px 24px 6px 6px !important')
  })

  it('corner keys belong to the border group (modified dot and reset)', () => {
    for (const k of ['radiusTl', 'radiusTr', 'radiusBr', 'radiusBl', 'radiusLinked']) expect(GROUP_KEYS.border).toContain(k)
    const style: BlockStyle = { radiusTl: 5, radiusLinked: true }
    expect(groupModified(style, GROUP_KEYS.border)).toBe(true)
    const reset = resetGroup(style, GROUP_KEYS.border)
    expect(reset.radiusTl).toBeUndefined()
    expect(reset.radiusLinked).toBeUndefined()
  })
})

describe('wave 59: font tokens', () => {
  it('accepts theme font tokens', () => {
    expect(blockFontStack('var(--font-display)')).toBe('var(--font-display)')
    expect(blockFontStack('var(--font-body)')).toBe('var(--font-body)')
    expect(blockFontStack('var(--eg-font-heading)')).toBe('var(--eg-font-heading)')
    expect(blockStyleToCss({ fontFamily: 'var(--font-body)' }).fontFamily).toBe('var(--font-body)')
  })

  it('rejects non-font tokens and injection', () => {
    expect(blockFontStack('var(--color-gold)')).toBeNull()
    expect(blockFontStack('var(--font-x); background:url(x)')).toBeNull()
    expect(blockFontStack('var(--font-x)}')).toBeNull()
    expect(blockFontStack('nope')).toBeNull()
  })

  it('still resolves built-in keys', () => {
    expect(blockFontStack('jost')).toContain('Jost')
  })

  it('offers the tokens in the select options', () => {
    expect(FONT_TOKEN_OPTIONS.map((o) => o.value)).toEqual(['var(--font-display)', 'var(--font-body)'])
  })
})
