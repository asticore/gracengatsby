import { describe, expect, it } from 'vitest'

import { gridStyle, parseSectionLayout, sectionLayoutProps } from '@/lib/sectionLayout'
import { asBlockStyle } from '@/lib/blockStyle'
import {
  clearDeviceOverrides,
  copyDesktopToDevice,
  hasDeviceOverrides,
} from '@/views/visualEditor/designHelpers'

describe('flex / grid layout sanitisers', () => {
  it('accepts the flex display and rem gap unit', () => {
    expect(parseSectionLayout({ display: 'flex', gapUnit: 'rem' })).toEqual({ display: 'flex', gapUnit: 'rem' })
  })
  it('rejects bad values', () => {
    const l = parseSectionLayout({
      display: 'flex',
      gapUnit: 'em',
      gridMinWidth: 10,
      gridFlow: 'sparse',
      gridJustify: 'left',
      gridGapTablet: -1,
      gridGapMobile: 999,
    })
    expect(l).toEqual({ display: 'flex' })
    expect(parseSectionLayout({ display: 'grid', gridMinWidth: 5000 })).toEqual({ display: 'grid' })
  })
  it('keeps valid grid keys', () => {
    const l = parseSectionLayout({ display: 'grid', gridMinWidth: 200.4, gridFlow: 'dense', gridJustify: 'center', gridGapTablet: 8, gridGapMobile: 4 })
    expect(l).toMatchObject({ gridMinWidth: 200, gridFlow: 'dense', gridJustify: 'center', gridGapTablet: 8, gridGapMobile: 4 })
  })
  it('leaves an old grid section unchanged', () => {
    expect(gridStyle({ display: 'grid' })).toEqual({ '--be-grid-cols': '3', '--be-grid-cols-m': '1', '--be-grid-gap': '16px', alignItems: 'stretch' })
  })
})

describe('flex / grid CSS output', () => {
  it('writes per-device flex gap with the chosen unit', () => {
    const p = sectionLayoutProps({ display: 'flex', gapUnit: 'rem', gap: { desktop: 2, tablet: 1.5, mobile: 1 }, direction: { desktop: 'row', mobile: 'column' }, wrap: false })
    expect(p.style['--be-gap-d']).toBe('2rem')
    expect(p.style['--be-gap-t']).toBe('1.5rem')
    expect(p.style['--be-gap-m']).toBe('1rem')
    expect(p.attrs['data-dir-m']).toBe('column')
    expect(p.attrs['data-nowrap']).toBe('1')
  })
  it('keeps px gap by default', () => {
    expect(sectionLayoutProps({ gap: { desktop: 12 } }).style['--be-gap-d']).toBe('12px')
  })
  it('writes per-device grid gap, dense flow, justify and auto-fit', () => {
    const s = gridStyle({ display: 'grid', gapUnit: 'rem', gridGap: 2, gridGapTablet: 1, gridGapMobile: 0.5, gridFlow: 'dense', gridJustify: 'end', gridMinWidth: 240 })
    expect(s['--be-grid-gap']).toBe('2rem')
    expect(s['--be-grid-gap-t']).toBe('1rem')
    expect(s['--be-grid-gap-m']).toBe('0.5rem')
    expect(s.gridAutoFlow).toBe('dense')
    expect(s.justifyItems).toBe('flex-end')
    expect(s.gridTemplateColumns).toBe('repeat(auto-fit,minmax(min(100%,240px),1fr))')
  })
})

describe('device copy helpers', () => {
  it('copies desktop responsive values into the tablet override, keeping other keys', () => {
    const style = asBlockStyle({ paddingTop: 20, textAlign: 'center', bgColor: '#fff', tablet: { paddingTop: 5, fontSize: 14 } })
    const next = copyDesktopToDevice(style, 'tablet')
    expect(next.tablet).toMatchObject({ paddingTop: 20, textAlign: 'center', fontSize: 14 })
    expect((next.tablet as Record<string, unknown>).bgColor).toBeUndefined()
    expect(next.mobile).toBeUndefined()
    expect(style.tablet).toEqual({ paddingTop: 5, fontSize: 14 })
  })
  it('returns the same object when there is nothing to copy', () => {
    const style = asBlockStyle({ bgColor: '#fff' })
    expect(copyDesktopToDevice(style, 'mobile')).toBe(style)
  })
  it('detects and clears overrides', () => {
    const style = asBlockStyle({ paddingTop: 2, tablet: { paddingTop: 1 }, mobile: { textAlign: 'left' }, paddingTopMobile: 3 })
    expect(hasDeviceOverrides(style, 'desktop')).toBe(false)
    expect(hasDeviceOverrides(style, 'tablet')).toBe(true)
    const cleared = clearDeviceOverrides(style, 'mobile')
    expect(cleared.mobile).toBeUndefined()
    expect(cleared.paddingTopMobile).toBeUndefined()
    expect(cleared.tablet).toEqual({ paddingTop: 1 })
    expect(hasDeviceOverrides(cleared, 'mobile')).toBe(false)
  })
})
