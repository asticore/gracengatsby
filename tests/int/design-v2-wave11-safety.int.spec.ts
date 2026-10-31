// Wave 11: design model v2 safety. Injection attempts and custom CSS scoping.
// The v1 render equivalence now lives in design-v1-render-path.int.spec.ts.
import { describe, expect, it } from 'vitest'

import { designToCss } from '@/lib/design/css'
import { scopeCustomCss } from '@/lib/design/customCss'
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
