import { describe, expect, it } from 'vitest'

import {
  asBlockStyle,
  blockStyleCss,
  blockStyleToCss,
  deviceOverrideDecls,
  sanitizeColor,
  sanitizeDeviceOverride,
  type BlockStyle,
} from '@/lib/blockStyle'
import {
  GROUP_KEYS,
  groupModified,
  linkedPatch,
  linkedValue,
  MARGIN_SIDE_KEYS,
  matchesQuery,
  resetGroup,
} from '@/views/visualEditor/designHelpers'

describe('wave 51 units', () => {
  it('sanitizes unit keys against the whitelist', () => {
    const s = asBlockStyle({ paddingTop: 4, paddingUnit: 'rem', marginUnit: 'pt', minHeightUnit: 'vh', selfWidthPercentUnit: 'url(x)' })
    expect(s.paddingUnit).toBe('rem')
    expect(s.marginUnit).toBeUndefined()
    expect(s.minHeightUnit).toBe('vh')
    expect(s.selfWidthPercentUnit).toBeUndefined()
    const o = sanitizeDeviceOverride({ paddingUnit: 'em', marginUnit: 'bad', marginLeft: 3, minHeightUnit: 'rem' })
    expect(o).toEqual({ paddingUnit: 'em', marginLeft: 3, minHeightUnit: 'rem' })
  })

  it('emits units inline and defaults to px', () => {
    const css = blockStyleToCss({ paddingTop: 2, paddingLeft: 3, marginTop: 1, marginLeft: 5, paddingUnit: 'rem', marginUnit: '%', minHeight: 50, minHeightUnit: 'vh' })
    expect(css.paddingTop).toBe('2rem')
    expect(css.paddingLeft).toBe('3rem')
    expect(css.marginTop).toBe('1%')
    expect(css.marginLeft).toBe('5%')
    expect(css.minHeight).toBe('50vh')
    expect(blockStyleToCss({ paddingTop: 2 }).paddingTop).toBe('2px')
  })

  it('emits custom width with its unit (default %)', () => {
    expect(blockStyleToCss({ selfWidth: 'custom', selfWidthPercent: 40 }).width).toBe('40%')
    expect(blockStyleToCss({ selfWidth: 'custom', selfWidthPercent: 300, selfWidthPercentUnit: 'px' }).width).toBe('300px')
  })

  it('emits device overrides with the merged unit', () => {
    const style: BlockStyle = { paddingTop: 10, paddingUnit: 'px', tablet: { paddingUnit: 'em' }, mobile: { marginLeft: 4, marginUnit: 'rem' } }
    expect(deviceOverrideDecls(style, 'tablet')).toContain('padding-top:10em !important')
    expect(deviceOverrideDecls(style, 'mobile')).toContain('margin-left:4rem !important')
    expect(blockStyleCss(style, 'x')).toContain('padding-top:10em !important')
  })

  it('old styles render identically', () => {
    const old: BlockStyle = { bgType: 'color', bgColor: '#111', paddingTop: 80, paddingBottom: 80, marginTop: 8, marginLeft: 6, minHeight: 100, minHeightUnit: 'vh', selfWidth: 'custom', selfWidthPercent: 50, mobile: { paddingTop: 20, marginBottom: 2 } }
    expect(asBlockStyle(old)).toEqual(old)
    const css = blockStyleToCss(old)
    expect(css.paddingTop).toBe('80px')
    expect(css.marginTop).toBe('8px')
    expect(css.marginLeft).toBe('6px')
    expect(css.minHeight).toBe('100vh')
    expect(css.width).toBe('50%')
    expect(deviceOverrideDecls(old, 'mobile')).toEqual(['padding-top:20px !important', 'margin-bottom:2px !important'])
  })
})

describe('wave 51 colours', () => {
  it('accepts var(--token) and rejects other var forms', () => {
    expect(sanitizeColor('var(--eg-c-primary)')).toBe('var(--eg-c-primary)')
    expect(sanitizeColor('#fff')).toBe('#fff')
    expect(sanitizeColor('var(--a;b)')).toBeUndefined()
    expect(sanitizeColor('var(--A)')).toBeUndefined()
    expect(sanitizeColor('url(x)}')).toBeUndefined()
    expect(sanitizeColor('red;}')).toBeUndefined()
    expect(asBlockStyle({ hoverBgColor: 'var(--eg-c-accent)', glass: undefined }).hoverBgColor).toBe('var(--eg-c-accent)')
    expect(asBlockStyle({ hoverBgColor: 'var(--x);}' }).hoverBgColor).toBeUndefined()
  })
})

describe('wave 51 helpers', () => {
  it('links margin sides', () => {
    expect(linkedPatch(MARGIN_SIDE_KEYS, 12)).toEqual({ marginTop: 12, marginBottom: 12, marginLeft: 12, marginRight: 12 })
    expect(linkedPatch(MARGIN_SIDE_KEYS, undefined).marginLeft).toBeUndefined()
    expect(linkedValue([4, 4, 4, 4])).toEqual({ same: true, value: 4 })
    expect(linkedValue([4, 5, 4, 4])).toEqual({ same: false, value: undefined })
    expect(linkedValue([undefined, undefined])).toEqual({ same: true, value: undefined })
  })

  it('detects modified groups and resets only that group', () => {
    const s: BlockStyle = { paddingTop: 4, bgType: 'color', bgColor: '#000', tablet: { paddingTop: 2, textAlign: 'center' } }
    expect(groupModified(s, GROUP_KEYS.spacing)).toBe(true)
    expect(groupModified(s, GROUP_KEYS.border)).toBe(false)
    const r = resetGroup(s, GROUP_KEYS.spacing)
    expect(r.paddingTop).toBeUndefined()
    expect(r.bgColor).toBe('#000')
    expect(r.tablet).toEqual({ textAlign: 'center' })
    expect(resetGroup({ tablet: { paddingTop: 1 } }, GROUP_KEYS.spacing).tablet).toBeUndefined()
  })

  it('searches labels case-insensitively', () => {
    expect(matchesQuery('PADD', 'Spacing', 'padding margin')).toBe(true)
    expect(matchesQuery('zzz', 'Spacing', 'padding')).toBe(false)
    expect(matchesQuery('  ', 'x')).toBe(true)
  })
})
