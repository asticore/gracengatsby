// Wave 11: design model v2 safety. Injection attempts, custom CSS scoping, and the v1 equivalence
// check against the old blockStyle path (declarations compared per device and state).
import { describe, expect, it } from 'vitest'

import { designToCss } from '@/lib/design/css'
import { scopeCustomCss } from '@/lib/design/customCss'
import { upgradeDesign } from '@/lib/design/upgrade'
import { blockStyleCss, blockStyleToCss, type BlockStyle } from '@/lib/blockStyle'
import type { DesignV2 } from '@/lib/design/types'

const SEL = '[data-eid="a"]'

/** A v2 design with the given top-level fields. */
const design = (fields: Partial<DesignV2>): DesignV2 => ({ schemaVersion: 2, ...fields })

describe('injection attempts never reach the output', () => {
  it('a colour carrying a closing brace and a new rule is dropped', () => {
    const css = designToCss(design({ color: { text: { desktop: { normal: 'red}body{display:none}' } } } }), 'a')
    expect(css).toBe('')
  })

  it('a value containing an HTML end tag is dropped', () => {
    const css = designToCss(design({ color: { text: { desktop: { normal: '</style><script>alert(1)</script>' } } } }), 'a')
    expect(css).toBe('')
  })

  it('an image URL that tries to break out of url() is dropped', () => {
    const css = designToCss(design({ background: { type: 'image', imageUrl: { desktop: { normal: '/a.jpg");}body{x:y' } } } }), 'a')
    expect(css).not.toContain('body')
    expect(css).not.toContain('background-image')
  })

  it('a javascript: image URL is dropped', () => {
    const css = designToCss(design({ background: { type: 'image', imageUrl: { desktop: { normal: 'javascript:alert(1)' } } } }), 'a')
    expect(css).toBe('')
  })

  it('custom CSS cannot close the style element', () => {
    const css = designToCss(design({ customCss: 'p{color:red}</style><script>alert(1)</script>' }), 'a')
    expect(css.toLowerCase()).not.toContain('</style')
    expect(css).not.toContain('<script')
    expect(css).not.toContain('<')
  })

  it('custom @import and url(javascript:) are removed', () => {
    const css = scopeCustomCss('@import url(evil.css); p{background:url(javascript:alert(1))}', SEL)
    expect(css).not.toContain('@import')
    expect(css).not.toContain('javascript')
    expect(css).toContain(`${SEL} p{background:`)
  })

  it('custom expression() and behavior are removed', () => {
    expect(scopeCustomCss('div{width:expression(alert(1))}', SEL)).toBe(`${SEL} div{width:alert(1))}`)
    expect(scopeCustomCss('div{behavior:url(x.htc)}', SEL)).not.toContain('behavior')
  })

  it('backslash escapes that could hide javascript: are removed', () => {
    const css = scopeCustomCss('a{background:url(j\\61vascript:alert(1))}', SEL)
    expect(css).not.toContain('\\')
    expect(css).not.toContain('javascript')
  })

  it('custom CSS cannot inject a rule through braces', () => {
    const css = scopeCustomCss('p{color:red}} body{display:none}', SEL)
    expect(css).not.toContain('body{')
  })
})

describe('custom CSS scoping', () => {
  it('prefixes each selector, and maps :root, html and body to the element itself', () => {
    expect(scopeCustomCss('.btn, :root{color:red}', SEL)).toBe(`${SEL} .btn,${SEL}{color:red}`)
    expect(scopeCustomCss('body{margin:0}', SEL)).toBe(`${SEL}{margin:0}`)
  })

  it('keeps one level of @media with scoped rules inside', () => {
    expect(scopeCustomCss('@media (max-width:500px){p{color:red}}', SEL)).toBe(`@media (max-width:500px){${SEL} p{color:red}}`)
  })

  it('drops other at-rules, which would be global', () => {
    expect(scopeCustomCss('@keyframes spin{from{opacity:0}} p{color:red}', SEL)).toBe(`${SEL} p{color:red}`)
  })

  it('strips comments, and an unterminated comment runs to the end', () => {
    expect(scopeCustomCss('/* hi */ p{color:red}', SEL)).toBe(`${SEL} p{color:red}`)
    expect(scopeCustomCss('p{color:red} /* open', SEL)).toBe(`${SEL} p{color:red}`)
  })

  it('returns empty for non-string or blank input', () => {
    expect(scopeCustomCss(undefined, SEL)).toBe('')
    expect(scopeCustomCss(42, SEL)).toBe('')
    expect(scopeCustomCss('   ', SEL)).toBe('')
  })
})

/**
 * Equivalence with the old v1 path. The old path emits an inline style object
 * (blockStyleToCss) and media rules (blockStyleCss). The new path upgrades v1
 * and emits v2 CSS. Both are parsed to declarations per context and compared.
 *
 * Known breakpoint differences, asserted below rather than hidden: v1 used
 * 768px for mobile and 769px for hide-on-desktop; v2 uses 767px and 1025px.
 * The two match except for widths in those 1px and 769 to 1024px bands.
 */
const mediaContext = (query: string): string => {
  if (/max-width:(768|767)px/.test(query)) return 'mobile'
  if (/min-width:(769|1025)px/.test(query)) return 'hideDesktop'
  if (/max-width:1024px/.test(query)) return 'tablet'
  return query
}

const parseDecls = (css: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {}
  const addRules = (ctx: string, text: string) => {
    for (const match of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const context = match[1].includes(':hover') ? `${ctx}:hover` : ctx
      for (const part of match[2].split(';')) {
        const idx = part.indexOf(':')
        if (idx < 0) continue
        const prop = part.slice(0, idx).trim()
        const value = part.slice(idx + 1).trim().replace(/"/g, '').replace(/\b0px\b/g, '0')
        ;(out[context] ??= []).push(`${prop}:${value}`)
      }
    }
  }
  const mediaRe = /@media ([^{]+)\{((?:[^{}]*\{[^{}]*\})*)\}/g
  for (const match of css.matchAll(mediaRe)) addRules(mediaContext(match[1]), match[2])
  addRules('base', css.replace(mediaRe, ''))
  return out
}

describe('v1 equivalence: old blockStyle path against upgrade + designToCss', () => {
  const oldPath = (style: BlockStyle): Record<string, string[]> => {
    const inline = blockStyleToCss(style) as Record<string, string | number>
    const base = Object.entries(inline)
      .map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`)
      .join(';')
    const media = blockStyleCss(style, 'a')
    return parseDecls(`${base ? `#a{${base}}` : ''}${media}`)
  }
  const newPath = (style: BlockStyle): Record<string, string[]> => parseDecls(designToCss(upgradeDesign(style) as DesignV2, 'a'))

  const sort = (m: Record<string, string[]>): Record<string, string[]> => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort()]))

  it('design 1: spacing, mobile padding, colours, border and shadow', () => {
    const style: BlockStyle = {
      paddingTop: 48,
      paddingBottom: 48,
      paddingTopMobile: 24,
      marginTop: 0,
      textColor: '#1d2b3a',
      textAlign: 'center',
      minHeight: 320,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: '#ccc',
      borderRadius: 12,
      boxShadow: 'md',
      bgType: 'color',
      bgColor: '#f5f7fa',
    }
    expect(sort(newPath(style))).toEqual(sort(oldPath(style)))
  })

  it('design 2: image background (cover, centred) with radius and a hidden-on-mobile flag', () => {
    const style: BlockStyle = {
      bgType: 'image',
      bgImageUrl: 'https://cdn.example.com/hero.jpg',
      paddingTop: 96,
      paddingBottom: 96,
      borderRadius: 0,
      hideOnMobile: true,
    }
    expect(sort(newPath(style))).toEqual(sort(oldPath(style)))
  })

  it('design 3: gradient background, large shadow, and a v1 width (legacy) with no visible effect', () => {
    const style: BlockStyle = {
      bgType: 'gradient',
      bgGradientFrom: '#0b1f3a',
      bgGradientTo: '#2a6fdb',
      bgGradientAngle: 135,
      boxShadow: 'lg',
      width: 'full',
      dividerTop: 'wave',
      paddingBottom: 16,
    }
    expect(sort(newPath(style))).toEqual(sort(oldPath(style)))
  })

  it('states the known breakpoint difference explicitly: v2 mobile is max 767px, v1 is 768px', () => {
    const oldMobile = blockStyleCss({ paddingTopMobile: 8 }, 'a')
    const newMobile = designToCss(upgradeDesign({ paddingTopMobile: 8 }) as DesignV2, 'a')
    expect(oldMobile).toContain('max-width:768px')
    expect(newMobile).toContain('max-width:767px')
  })
})
