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

/**
 * Property test: the rules emitCascade writes, read the way a browser cascade
 * reads them, give the same value as resolveValue for every width and state.
 * Hover rules outrank normal rules (higher specificity); media rules apply at
 * their widths (tablet rules up to 1024px, mobile rules up to 767px).
 */
import { emitCascade, MEDIA_MOBILE as M_MOBILE, MEDIA_TABLET as M_TABLET } from '@/lib/design/cssEmit'
import { leaf, type Leaf } from '@/lib/design/cssGetters'
import type { Rs as RsT } from '@/lib/design/types'

type ParsedRule = { media: string | null; hover: boolean; decls: Record<string, string> }

function parseCascade(css: string): ParsedRule[] {
  const rules: ParsedRule[] = []
  const block = (text: string, media: string | null) => {
    for (const m of text.matchAll(/(\[[^\]]+\])(:hover)?\{([^}]*)\}/g)) {
      const decls: Record<string, string> = {}
      for (const d of m[3].split(';').filter(Boolean)) {
        const i = d.indexOf(':')
        decls[d.slice(0, i)] = d.slice(i + 1)
      }
      rules.push({ media, hover: m[2] === ':hover', decls })
    }
  }
  let rest = css
  while (rest.length > 0) {
    if (rest.startsWith('@media ')) {
      const open = rest.indexOf('{')
      const close = rest.indexOf('}}', open)
      const query = rest.slice(7, open)
      block(rest.slice(open + 1, close + 1), query)
      rest = rest.slice(close + 2)
    } else {
      const close = rest.indexOf('}')
      block(rest.slice(0, close + 1), null)
      rest = rest.slice(close + 1)
    }
  }
  return rules
}

const WIDTH = { desktop: 1200, tablet: 900, mobile: 400 } as const
const applies = (media: string | null, width: number): boolean => {
  if (media === null) return true
  if (media === M_TABLET) return width <= 1024
  if (media === M_MOBILE) return width <= 767
  throw new Error(`unexpected media ${media}`)
}

function effective(rules: ParsedRule[], prop: string, width: number, hovering: boolean): string | undefined {
  const live = rules.filter((r) => r.decls[prop] !== undefined && applies(r.media, width))
  if (hovering) {
    const hoverRules = live.filter((r) => r.hover)
    if (hoverRules.length > 0) return hoverRules[hoverRules.length - 1].decls[prop]
  }
  const normal = live.filter((r) => !r.hover)
  return normal.length > 0 ? normal[normal.length - 1].decls[prop] : undefined
}

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

describe('emitCascade matches resolveValue at every width and state', () => {
  const VALUES = ['#111', '#222', '#333']
  const randomRs = (rnd: () => number): RsT<string> => {
    const out: RsT<string> = {}
    for (const device of ['desktop', 'tablet', 'mobile'] as const) {
      if (rnd() < 0.5) continue
      const stated: { normal?: string; hover?: string } = {}
      if (rnd() < 0.6) stated.normal = VALUES[Math.floor(rnd() * 3)]
      if (rnd() < 0.5) stated.hover = VALUES[Math.floor(rnd() * 3)]
      out[device] = stated
    }
    return out
  }

  it('agrees with resolveValue for 400 random designs', () => {
    const rnd = seeded(42)
    const id = (v: unknown) => (typeof v === 'string' ? v : undefined)
    for (let n = 0; n < 400; n++) {
      const rs = randomRs(rnd)
      const leaves: Leaf[] = [leaf('color', rs, id)]
      const css = emitCascade(leaves, '[data-eid="p"]')
      const rules = parseCascade(css)
      for (const device of ['desktop', 'tablet', 'mobile'] as const) {
        for (const state of ['normal', 'hover'] as const) {
          const expected = resolveValue(rs, device, state)
          const actual = effective(rules, 'color', WIDTH[device], state === 'hover')
          if (actual !== expected) {
            throw new Error(`case ${n} ${device}/${state}: rs=${JSON.stringify(rs)} css=${css} expected=${expected} actual=${actual}`)
          }
        }
      }
    }
  })
})
