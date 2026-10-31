import { describe, expect, it } from 'vitest'

import { scopeCustomCss } from '@/lib/design/customCss'
import { designToCss } from '@/lib/design/css'

const SCOPE = '[data-eid="s1"]'

describe('scopeCustomCss sanitising', () => {
  it('returns empty for missing, blank or non-string input', () => {
    expect(scopeCustomCss(undefined, SCOPE)).toBe('')
    expect(scopeCustomCss('   ', SCOPE)).toBe('')
    expect(scopeCustomCss(42, SCOPE)).toBe('')
  })

  it('prefixes selectors with the element scope', () => {
    expect(scopeCustomCss('h2 { color: red}', SCOPE)).toBe(`${SCOPE} h2{color: red}`)
  })

  it('maps html, body and :root onto the element itself', () => {
    expect(scopeCustomCss(':root { --x: 1}', SCOPE)).toBe(`${SCOPE}{--x: 1}`)
    expect(scopeCustomCss('body { margin: 0}', SCOPE)).toBe(`${SCOPE}{margin: 0}`)
  })

  it('scopes each comma-separated selector', () => {
    expect(scopeCustomCss('a, b { color: red}', SCOPE)).toBe(`${SCOPE} a,${SCOPE} b{color: red}`)
  })

  it('removes @import, expression(), javascript:, behavior and -moz-binding', () => {
    const out = scopeCustomCss(
      '@import url(http://evil.test/x.css); p { width: expression(alert(1)); background: javascript:alert(1); behavior: url(x.htc); -moz-binding: url(x) }',
      SCOPE,
    )
    for (const bad of ['@import', 'expression', 'javascript', 'behavior', '-moz-binding']) expect(out.toLowerCase()).not.toContain(bad)
  })

  it('removes "<" so the output cannot close the style tag', () => {
    const out = scopeCustomCss('p { content: "</style><script>alert(1)</script>" }', SCOPE)
    expect(out).not.toContain('<')
    expect(out).not.toContain('</style>')
  })

  it('removes backslash escapes, which can hide dangerous words', () => {
    const out = scopeCustomCss('p { background: \\6a avascript:alert(1) }', SCOPE)
    expect(out).not.toContain('\\')
  })

  it('removes comments, including an unterminated one', () => {
    expect(scopeCustomCss('p { color: red} /* hidden', SCOPE)).toBe(`${SCOPE} p{color: red}`)
    expect(scopeCustomCss('/* a */ p { color: red}', SCOPE)).toBe(`${SCOPE} p{color: red}`)
  })

  it('keeps url() only for http(s) and site-relative addresses', () => {
    expect(scopeCustomCss('p { background: url(https://cdn.example.com/a.png) }', SCOPE)).toContain('url("https://cdn.example.com/a.png")')
    expect(scopeCustomCss('p { background: url(/media/a.png) }', SCOPE)).toContain('url("/media/a.png")')
    const bad = scopeCustomCss('p { background: url(javascript:alert(1)) }', SCOPE)
    expect(bad).not.toContain('url(')
  })

  it('keeps @media blocks but drops nested at-rules and keyframes (they would be global)', () => {
    const out = scopeCustomCss('@media (max-width: 600px) { p { color: red} } @keyframes spin { from { opacity: 0 } } @font-face { font-family: X }', SCOPE)
    expect(out).toBe(`@media (max-width: 600px){${SCOPE} p{color: red}}`)
  })

  it('drops nested @media inside @media', () => {
    const out = scopeCustomCss('@media print { @media (min-width: 1px) { p { color: red} } }', SCOPE)
    expect(out).toBe('')
  })

  it('drops selectors that cannot be scoped safely', () => {
    expect(scopeCustomCss('p:hover, div { color: red}', SCOPE)).toBe(`${SCOPE} p:hover,${SCOPE} div{color: red}`)
    // Braces inside quoted strings are not rule boundaries: they are removed first.
    expect(scopeCustomCss('p[x="{"] { color: red}', SCOPE)).toBe(`${SCOPE} p[x=""]{color: red}`)
    expect(scopeCustomCss('p[x="}"] { color: red} div { color: blue}', SCOPE)).toBe(`${SCOPE} p[x=""]{color: red}${SCOPE} div{color: blue}`)
  })

  it('a brace inside a quoted string cannot open a second rule', () => {
    const out = scopeCustomCss('p::before { content: "{ } } x" } span { color: red}', SCOPE)
    expect(out).toBe(`${SCOPE} p::before{content: "   x"}${SCOPE} span{color: red}`)
  })

  it('output braces are balanced for hostile input', () => {
    const out = scopeCustomCss('p { color: red }}} }{ div { a: b', SCOPE)
    const opens = (out.match(/\{/g) ?? []).length
    const closes = (out.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('designToCss places sanitised custom CSS inside the element scope', () => {
    const css = designToCss({ schemaVersion: 2, customCss: 'p{color:red}@import url(x);' }, 's1')
    expect(css).toContain(`${SCOPE} p{color:red}`)
    expect(css).not.toContain('@import')
  })
})
