import { describe, expect, it } from 'vitest'

import { designToCss } from '@/lib/design/css'
import { resolveValue } from '@/lib/design/cascade'
import { MEDIA_MOBILE, MEDIA_TABLET } from '@/lib/design/cssEmit'
import { upgradeDesign, isDesignError } from '@/lib/design/upgrade'
import type { DesignV2, Rs } from '@/lib/design/types'

const px = (value: number) => ({ value, unit: 'px' as const })
const SEL = '[data-eid="s1"]'

describe('resolveValue (device and state cascade)', () => {
  const leaf: Rs<string> = {
    desktop: { normal: 'd-n', hover: 'd-h' },
    tablet: { normal: 't-n' },
    mobile: { hover: 'm-h' },
  }

  it('desktop resolves its own normal and hover values', () => {
    expect(resolveValue(leaf, 'desktop')).toBe('d-n')
    expect(resolveValue(leaf, 'desktop', 'hover')).toBe('d-h')
  })

  it('tablet uses its own normal on hover when it has no hover (the device value beats the wider hover)', () => {
    expect(resolveValue(leaf, 'tablet', 'hover')).toBe('t-n')
    expect(resolveValue(leaf, 'tablet')).toBe('t-n')
  })

  it('mobile normal falls back through tablet then desktop', () => {
    expect(resolveValue(leaf, 'mobile')).toBe('t-n')
    expect(resolveValue(leaf, 'mobile', 'hover')).toBe('m-h')
  })

  it('a mobile normal value beats a desktop hover value on mobile (touch has no hover)', () => {
    const touch: Rs<string> = { desktop: { hover: 'd-h' }, mobile: { normal: 'm-n' } }
    expect(resolveValue(touch, 'mobile', 'hover')).toBe('m-n')
  })

  it('returns undefined when nothing in the chain is set', () => {
    expect(resolveValue(undefined, 'desktop')).toBeUndefined()
    expect(resolveValue({ tablet: { normal: 'x' } }, 'desktop')).toBeUndefined()
  })
})

describe('designToCss emits the device and state rules', () => {
  const design: DesignV2 = {
    schemaVersion: 2,
    color: { text: { desktop: { normal: '#111', hover: '#222' }, mobile: { normal: '#111' } } },
    spacing: { padding: { top: { desktop: { normal: px(40) }, mobile: { normal: px(16) } } } },
  }
  const css = designToCss(design, 's1')

  it('scopes every rule to the element and nothing else', () => {
    const selectors = [...css.replace(/@media [^{]+\{/g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1])
    expect(selectors.length).toBeGreaterThan(0)
    for (const s of selectors) expect(s.startsWith(SEL)).toBe(true)
  })

  it('writes the desktop normal and hover rules first', () => {
    expect(css.startsWith(`${SEL}{padding-top:40px;color:#111}${SEL}:hover{color:#222}`)).toBe(true)
  })

  it('writes the mobile padding inside the mobile media query', () => {
    expect(css).toContain(`@media ${MEDIA_MOBILE}{${SEL}{padding-top:16px}`)
  })

  it('writes no tablet rule when tablet has no values of its own', () => {
    expect(css).not.toContain(`@media ${MEDIA_TABLET}`)
  })

  it('a missing scope id or a design that sets nothing emits no CSS', () => {
    expect(designToCss(design, 'bad id')).toBe('')
    expect(designToCss({ schemaVersion: 2 }, 's1')).toBe('')
  })

  it('hides the element on the device it is flagged for', () => {
    const css2 = designToCss({ schemaVersion: 2, visibility: { hideMobile: true } }, 's1')
    expect(css2).toContain(`@media ${MEDIA_MOBILE}{${SEL}{display:none}}`)
  })

  it('custom CSS is emitted last, after the generated rules', () => {
    const css3 = designToCss({ schemaVersion: 2, color: { text: { desktop: { normal: '#111' } } }, customCss: 'p{margin:0}' }, 's1')
    expect(css3.indexOf(`${SEL}{color:#111}`)).toBeLessThan(css3.indexOf(`${SEL} p{margin:0}`))
  })
})

describe('upgradeDesign on read', () => {
  it('reads null, arrays and scalars as an empty v2 design', () => {
    expect(upgradeDesign(null)).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign([1])).toEqual({ schemaVersion: 2 })
    expect(upgradeDesign('x')).toEqual({ schemaVersion: 2 })
  })

  it('reports versions above 2 as errors and never guesses at them', () => {
    const r = upgradeDesign({ schemaVersion: 3 })
    expect(isDesignError(r)).toBe(true)
    expect(isDesignError(upgradeDesign({ schemaVersion: 'two' }))).toBe(true)
  })

  it('a v2 value is returned as an independent copy', () => {
    const stored = { schemaVersion: 2, color: { text: { desktop: { normal: '#111' } } } }
    const copy = upgradeDesign(stored) as DesignV2
    expect(copy).toEqual(stored)
    expect(copy).not.toBe(stored)
    expect(copy.color).not.toBe(stored.color)
  })

  it('upgrading an already upgraded v2 value is a no-op (idempotent)', () => {
    const once = upgradeDesign({ paddingTop: 30, bgColor: '#fff', borderWidth: 2 })
    const twice = upgradeDesign(once)
    expect(twice).toEqual(once)
  })
})
