// Wave 11: design model v2 CSS. Scoped output, hover and media rules, units,
// injection attempts, and a v1 equivalence check against the old blockStyle path.
import { describe, expect, it } from 'vitest'

import { designToCss } from '@/lib/design/css'
import type { DesignV2, Length } from '@/lib/design/types'

const px = (value: number): Length => ({ value, unit: 'px' })
const SEL = '[data-eid="a"]'
const TABLET = '@media (max-width:1024px)'
const MOBILE = '@media (max-width:767px)'

/** Clone helper: a v2 design with the given top-level fields. */
const design = (fields: Partial<DesignV2>): DesignV2 => ({ schemaVersion: 2, ...fields })

describe('designToCss: scope and base output', () => {
  it('an empty design, or an unsafe scope id, emits nothing', () => {
    expect(designToCss(design({}), 'a')).toBe('')
    expect(designToCss(design({ opacity: { desktop: { normal: 0.5 } } }), 'a"]{x}')).toBe('')
    expect(designToCss(design({ opacity: { desktop: { normal: 0.5 } } }), '')).toBe('')
  })

  it('every rule is scoped to the element id', () => {
    const css = designToCss(design({ spacing: { margin: { top: { desktop: { normal: px(10) } } } } }), 'a')
    expect(css).toBe(`${SEL}{margin-top:10px}`)
  })

  it('writes margin and padding per side with px values', () => {
    const css = designToCss(
      design({
        spacing: {
          margin: { top: { desktop: { normal: px(1) } }, bottom: { desktop: { normal: px(2) } } },
          padding: { left: { desktop: { normal: px(3) } }, right: { desktop: { normal: px(4) } } },
        },
      }),
      'a',
    )
    expect(css).toBe(`${SEL}{margin-top:1px;margin-bottom:2px;padding-right:4px;padding-left:3px}`)
  })

  it('output is deterministic and compact for the same input', () => {
    const d = design({ typography: { size: { desktop: { normal: px(16) } }, weight: { desktop: { normal: 700 } } } })
    expect(designToCss(d, 'a')).toBe(designToCss(d, 'a'))
    expect(designToCss(d, 'a')).toBe(`${SEL}{font-size:16px;font-weight:700}`)
  })

  it('a value outside the allowed range is dropped, not emitted', () => {
    expect(designToCss(design({ opacity: { desktop: { normal: 3 } } }), 'a')).toBe('')
    expect(designToCss(design({ opacity: { desktop: { normal: 0.25 } } }), 'a')).toBe(`${SEL}{opacity:0.25}`)
  })

  it('font family with unsafe characters is dropped', () => {
    expect(designToCss(design({ typography: { family: { desktop: { normal: 'Arial;}body{display:none' } } } }), 'a')).toBe('')
    expect(designToCss(design({ typography: { family: { desktop: { normal: "'Open Sans', sans-serif" } } } }), 'a')).toBe(
      `${SEL}{font-family:'Open Sans', sans-serif}`,
    )
  })
})

describe('designToCss: units and number formatting', () => {
  it('emits each allowed unit as written', () => {
    for (const unit of ['px', '%', 'em', 'rem', 'vw', 'vh'] as const) {
      const css = designToCss(design({ size: { width: { desktop: { normal: { value: 50, unit } } } } }), 'a')
      expect(css).toBe(`${SEL}{width:50${unit}}`)
    }
  })

  it('drops a length with a unit that is not on the list', () => {
    const bad = { value: 4, unit: 'pt' } as unknown as Length
    expect(designToCss(design({ size: { width: { desktop: { normal: bad } } } }), 'a')).toBe('')
  })

  it('auto is accepted for lengths', () => {
    expect(designToCss(design({ spacing: { margin: { left: { desktop: { normal: { value: 'auto', unit: 'px' } } } } } }), 'a')).toBe(`${SEL}{margin-left:auto}`)
  })

  it('numbers are at most 4 decimals with no exponent', () => {
    expect(designToCss(design({ opacity: { desktop: { normal: 0.123456 } } }), 'a')).toBe(`${SEL}{opacity:0.1235}`)
    expect(designToCss(design({ opacity: { desktop: { normal: 1e-7 } } }), 'a')).toBe(`${SEL}{opacity:0}`)
  })
})

describe('designToCss: hover, devices and media', () => {
  it('writes a hover rule only when the hover value differs from normal', () => {
    const css = designToCss(design({ color: { text: { desktop: { normal: '#000', hover: '#f00' } } } }), 'a')
    expect(css).toBe(`${SEL}{color:#000}${SEL}:hover{color:#f00}`)
    const same = designToCss(design({ color: { text: { desktop: { normal: '#000', hover: '#000' } } } }), 'a')
    expect(same).toBe(`${SEL}{color:#000}`)
  })

  it('a tablet value goes in the tablet media block', () => {
    const css = designToCss(design({ typography: { size: { desktop: { normal: px(18) }, tablet: { normal: px(14) } } } }), 'a')
    expect(css).toBe(`${SEL}{font-size:18px}${TABLET}{${SEL}{font-size:14px}}`)
  })

  it('a mobile value goes in the mobile media block and overrides tablet', () => {
    const css = designToCss(
      design({ spacing: { padding: { top: { desktop: { normal: px(40) }, tablet: { normal: px(20) }, mobile: { normal: px(8) } } } } }),
      'a',
    )
    expect(css).toBe(`${SEL}{padding-top:40px}${TABLET}{${SEL}{padding-top:20px}}${MOBILE}{${SEL}{padding-top:8px}}`)
  })

  it('a value the same as the wider device is not repeated in a media block', () => {
    const css = designToCss(design({ spacing: { padding: { top: { desktop: { normal: px(8) }, mobile: { normal: px(8) } } } } }), 'a')
    expect(css).toBe(`${SEL}{padding-top:8px}`)
  })

  it('a mobile normal value overrides a desktop hover value on mobile, including while hovering', () => {
    const css = designToCss(
      design({ color: { text: { desktop: { normal: '#000', hover: '#f00' }, mobile: { normal: '#00f' } } } }),
      'a',
    )
    expect(css).toContain(`${SEL}:hover{color:#f00}`)
    expect(css).toContain(`${MOBILE}{${SEL}{color:#00f}${SEL}:hover{color:#00f}}`)
  })

  it('a tablet hover value appears in the tablet block', () => {
    const css = designToCss(design({ color: { text: { desktop: { normal: '#000' }, tablet: { hover: '#0f0' } } } }), 'a')
    expect(css).toContain(`${TABLET}{${SEL}:hover{color:#0f0}}`)
  })

  it('hide flags emit display:none in the right media query', () => {
    expect(designToCss(design({ visibility: { hideDesktop: true } }), 'a')).toBe(`@media (min-width:1025px){${SEL}{display:none}}`)
    expect(designToCss(design({ visibility: { hideTablet: true } }), 'a')).toBe(
      `@media (min-width:768px) and (max-width:1024px){${SEL}{display:none}}`,
    )
    expect(designToCss(design({ visibility: { hideMobile: true } }), 'a')).toBe(`${MOBILE}{${SEL}{display:none}}`)
  })

  it('hide rules come after the cascade so they win', () => {
    const css = designToCss(design({ opacity: { desktop: { normal: 0.5 } }, visibility: { hideMobile: true } }), 'a')
    expect(css.indexOf('opacity')).toBeLessThan(css.indexOf('display:none'))
  })
})

describe('designToCss: transforms, shadows, backgrounds, containers', () => {
  it('composes translate, rotate, skew and scale, with flips folded into scale', () => {
    const css = designToCss(
      design({ transform: { rotate: { desktop: { normal: 45 } }, offsetX: { desktop: { normal: px(10) } }, scaleX: { desktop: { normal: 2 } }, flipH: { desktop: { normal: true } } } }),
      'a',
    )
    expect(css).toBe(`${SEL}{transform:translate(10px,0px) rotate(45deg) scale(-2,1)}`)
  })

  it('a skew value fills in the missing axis with 0', () => {
    const css = designToCss(design({ transform: { skewX: { desktop: { normal: 10 } } } }), 'a')
    expect(css).toBe(`${SEL}{transform:skew(10deg,0deg)}`)
  })

  it('a box shadow is one value with x, y, blur and colour', () => {
    const css = designToCss(
      design({ boxShadow: { x: { desktop: { normal: px(0) } }, y: { desktop: { normal: px(4) } }, blur: { desktop: { normal: px(10) } }, color: { desktop: { normal: 'rgba(0,0,0,0.3)' } } } }),
      'a',
    )
    expect(css).toBe(`${SEL}{box-shadow:0px 4px 10px rgba(0,0,0,0.3)}`)
  })

  it('an image background with an overlay gives a gradient layer above the image', () => {
    const css = designToCss(
      design({ background: { type: 'image', imageUrl: { desktop: { normal: 'https://cdn.example.com/a.jpg' } }, overlay: { desktop: { normal: 50 } } } }),
      'a',
    )
    expect(css).toContain('background-image:linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url("https://cdn.example.com/a.jpg")')
  })

  it('a gradient background uses the angle and the two colours', () => {
    const css = designToCss(design({ background: { type: 'gradient', gradient: { from: { desktop: { normal: '#000' } }, to: { desktop: { normal: '#fff' } }, angle: { desktop: { normal: 90 } } } } }), 'a')
    expect(css).toBe(`${SEL}{background-image:linear-gradient(90deg, #000, #fff)}`)
  })

  it('background colour is only written when the background type is colour', () => {
    const css = designToCss(design({ background: { type: 'gradient', color: { desktop: { normal: '#abc' } } } }), 'a')
    expect(css).not.toContain('background-color')
  })

  it('a flex container emits display:flex with its fields', () => {
    const css = designToCss(design({ container: { direction: { desktop: { normal: 'row' } }, gap: { desktop: { normal: px(12) } } } }), 'a')
    expect(css).toBe(`${SEL}{display:flex;flex-direction:row;gap:12px}`)
  })

  it('the text stroke needs a width and uses currentColor when no colour is set', () => {
    expect(designToCss(design({ textStroke: { color: { desktop: { normal: '#f00' } } } }), 'a')).toBe('')
    expect(designToCss(design({ textStroke: { width: { desktop: { normal: px(1) } } } }), 'a')).toBe(`${SEL}{-webkit-text-stroke:1px currentColor}`)
  })

  it('custom CSS is written last, after the generated rules', () => {
    const css = designToCss(design({ opacity: { desktop: { normal: 0.5 } }, customCss: 'p{color:red}' }), 'a')
    expect(css.endsWith(`${SEL} p{color:red}`)).toBe(true)
  })
})
