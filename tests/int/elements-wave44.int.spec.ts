import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { enabledPageEffects, pageEffectsCss, pageEffectsOf } from '@/components/blocks/elements/Wave44Elements'
import { ELEMENT_CATEGORIES, ELEMENTS } from '@/lib/elements/registry'
import { WAVE44_ELEMENTS } from '@/lib/elements/wave44Defs'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const cats = new Set(ELEMENT_CATEGORIES.map((c) => c.key))

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'src/components/blocks/elements')
const DEFS = path.join(ROOT, 'src/lib/elements/wave44Defs.ts')
const CSS_PATH = path.join(DIR, 'wave44.css')
const RENDERER = path.join(DIR, 'Wave44Elements.tsx')
const CANVAS = path.join(ROOT, 'src/views/visualEditor/CanvasBlockPreview.tsx')
const SOURCES = [RENDERER, CSS_PATH, DEFS]

const ALL_OFF = { smoothScroll: false, pageTransition: false, grain: false, scrollProgress: false }
const ALL_ON = { smoothScroll: true, pageTransition: true, transitionMs: 300, grain: true, grainOpacity: 12, scrollProgress: true, progressColor: '#00a9ff', progressHeight: 3 }

/**
 * Lists the declarations that start with "animation" or "transition" and the at-rule or rule headers around them.
 * Returns the ones that are not inside a prefers-reduced-motion: no-preference block.
 */
function unguardedMotion(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack: string[] = []
  const bad: string[] = []
  let buf = ''
  for (const ch of src) {
    if (ch === '{') {
      stack.push(buf.trim())
      buf = ''
    } else if (ch === '}') {
      stack.pop()
      buf = ''
    } else if (ch === ';') {
      const prop = buf.split(':')[0]?.trim().toLowerCase() ?? ''
      if (/^(animation|transition)/.test(prop) && !stack.some((h) => h.includes('prefers-reduced-motion: no-preference'))) bad.push(`${prop} in ${stack.join(' > ')}`)
      buf = ''
    } else buf += ch
  }
  return bad
}

describe('wave 44 registry', () => {
  it('registers page-effects once, in the siteMeta category, with every effect off by default', () => {
    const matches = ELEMENTS.filter((e) => e.type === 'page-effects')
    expect(matches).toHaveLength(1)
    expect(WAVE44_ELEMENTS.map((e) => e.type)).toEqual(['page-effects'])
    expect(cats.has('siteMeta')).toBe(true)
    expect(WAVE44_ELEMENTS[0]!.category).toBe('siteMeta')
    const d = WAVE44_ELEMENTS[0]!.defaultProps()
    expect(d.smoothScroll).toBe(false)
    expect(d.pageTransition).toBe(false)
    expect(d.grain).toBe(false)
    expect(d.scrollProgress).toBe(false)
  })

  it('has no cursor glow field (the wave 53 cursor ring is separate)', () => {
    const names = WAVE44_ELEMENTS[0]!.fields.map((f) => f.name)
    expect(names.some((n) => /glow/i.test(n))).toBe(false)
  })

  it('default props only use declared fields, with matching value kinds and help text on every field', () => {
    const e = WAVE44_ELEMENTS[0]!
    const props = e.defaultProps()
    for (const [k, v] of Object.entries(props)) {
      const field = e.fields.find((f) => f.name === k)
      expect(field, k).toBeDefined()
      if (field!.type === 'range') expect(typeof v, k).toBe('number')
      if (field!.type === 'checkbox') expect(typeof v, k).toBe('boolean')
      if (field!.type === 'color') expect(typeof v, k).toBe('string')
    }
    for (const f of e.fields) expect(f.helpText, f.name).toBeTruthy()
    expect(new Set(e.fields.map((f) => f.name)).size).toBe(e.fields.length)
  })

  it('has a component for the type and renders nothing with every effect off', () => {
    expect(ELEMENT_COMPONENTS['page-effects']).toBeDefined()
    expect(render(renderElement('page-effects', ALL_OFF))).toBe('')
    expect(render(renderElement('page-effects', {}))).toBe('')
  })
})

describe('page effects: smooth scrolling', () => {
  it('scrolls smoothly only inside the no-preference guard', () => {
    const html = render(renderElement('page-effects', { smoothScroll: true }))
    expect(html).toContain('@media (prefers-reduced-motion: no-preference){html{scroll-behavior:smooth}}')
    expect(html).toContain('aria-hidden="true"')
  })

  it('emits no scroll rule when off', () => {
    expect(pageEffectsCss({ ...ALL_OFF })).toBe('')
  })
})

describe('page effects: page transition', () => {
  it('turns on view transitions at top level, with a fade and reduced-motion off switch', () => {
    const css = pageEffectsCss({ pageTransition: true, transitionMs: 400 })
    expect(css).toContain('@view-transition{navigation:auto}')
    expect(css).toContain('::view-transition-old(root),::view-transition-new(root){animation-duration:400ms}')
    expect(css.startsWith('@view-transition{')).toBe(true)
    expect(css).toContain('@media (prefers-reduced-motion: reduce){::view-transition-group(*)')
  })

  it('clamps the duration to 100-600 ms and falls back to 250 ms', () => {
    expect(pageEffectsOf({ pageTransition: true, transitionMs: 5 }).transitionMs).toBe(100)
    expect(pageEffectsOf({ pageTransition: true, transitionMs: 99999 }).transitionMs).toBe(600)
    expect(pageEffectsOf({ pageTransition: true, transitionMs: 'nope' }).transitionMs).toBe(250)
    expect(pageEffectsCss({ pageTransition: true, transitionMs: 99999 })).toContain('animation-duration:600ms')
  })
})

describe('page effects: grain', () => {
  it('renders a fixed, click-through, hidden-from-AT overlay with the noise filter in the stylesheet', () => {
    const html = render(renderElement('page-effects', { grain: true, grainOpacity: 10 }))
    expect(html).toContain('class="be-el-44-grain"')
    expect(html).toContain('.be-el-44 .be-el-44-grain{opacity:0.1}')
    const css = fs.readFileSync(CSS_PATH, 'utf8')
    expect(css).toContain('feTurbulence')
    expect(css).toMatch(/\.be-el-44-grain \{[^}]*position: fixed/)
    expect(css).toMatch(/\.be-el-44-grain \{[^}]*pointer-events: none/)
    expect(css).toMatch(/\.be-el-44-grain \{[^}]*z-index: 9000/)
  })

  it('clamps the strength to 1-30 percent', () => {
    expect(pageEffectsOf({ grain: true, grainOpacity: 0 }).grainOpacity).toBe(1)
    expect(pageEffectsOf({ grain: true, grainOpacity: 80 }).grainOpacity).toBe(30)
    expect(pageEffectsCss({ grain: true, grainOpacity: 80 })).toContain('opacity:0.3}')
  })
})

describe('page effects: scroll progress', () => {
  it('renders the bar and the colour and height, and hides the bar unless supported', () => {
    const html = render(renderElement('page-effects', { scrollProgress: true, progressColor: '#00a9ff', progressHeight: 6 }))
    expect(html).toContain('class="be-el-44-progress"')
    expect(html).toContain('background:#00a9ff;height:6px')
    const css = fs.readFileSync(CSS_PATH, 'utf8')
    expect(css).toMatch(/\.be-el-44-progress \{\s*display: none;/)
    expect(css).toContain('@supports (animation-timeline: scroll())')
    expect(css).toContain('animation-timeline: scroll(root);')
  })

  it('refuses a colour that is not hex, rgb or hsl and uses the default instead', () => {
    const css = pageEffectsCss({ scrollProgress: true, progressColor: 'red;background:url(x)' })
    expect(css).not.toContain('url(x)')
    expect(css).toContain('background:#2e3192')
    expect(pageEffectsCss({ scrollProgress: true, progressColor: 'url(//evil.example/x.png)' })).not.toContain('evil')
    expect(pageEffectsCss({ scrollProgress: true, progressColor: 'rgb(0, 169, 255)' })).toContain('background:rgb(0, 169, 255)')
  })

  it('clamps the height to 1-8 px', () => {
    expect(pageEffectsOf({ scrollProgress: true, progressHeight: 0 }).progressHeight).toBe(1)
    expect(pageEffectsOf({ scrollProgress: true, progressHeight: 50 }).progressHeight).toBe(8)
  })
})

describe('page effects: all on, escaping and source hygiene', () => {
  it('writes every enabled rule into one style tag', () => {
    const html = render(renderElement('page-effects', ALL_ON))
    expect(html.match(/<style>/g)).toHaveLength(1)
    expect(html).toContain('scroll-behavior:smooth')
    expect(html).toContain('@view-transition{navigation:auto}')
    expect(html).toContain('be-el-44-grain')
    expect(html).toContain('be-el-44-progress')
  })

  it('never writes raw text from props into the style tag', () => {
    const css = pageEffectsCss({ ...ALL_ON, progressColor: '</style><script>alert(1)</script>' })
    expect(css).not.toContain('<script')
    expect(css).not.toContain('</style')
  })

  it('lists the enabled effects for the canvas', () => {
    expect(enabledPageEffects(ALL_OFF)).toEqual([])
    expect(enabledPageEffects(ALL_ON)).toEqual(['Smooth scrolling', 'Fade between pages (300 ms)', 'Grain overlay (12%)', 'Scroll progress bar (3 px)'])
  })

  it('guards every animation and transition with prefers-reduced-motion: no-preference', () => {
    expect(unguardedMotion(fs.readFileSync(CSS_PATH, 'utf8'))).toEqual([])
    expect(unguardedMotion(pageEffectsCss(ALL_ON))).toEqual([])
    expect(unguardedMotion('.x{animation:spin 1s;}')).not.toEqual([])
  })

  it('shows a canvas placeholder for the element', () => {
    const src = fs.readFileSync(CANVAS, 'utf8')
    expect(src).toContain("elementType === 'page-effects'")
    expect(src).toContain('Page effects (live page only)')
  })

  it('keeps the new source files ASCII only', () => {
    for (const file of SOURCES) {
      const bad = fs.readFileSync(file, 'utf8').split('\n').filter((line) => /[^\x00-\x7f]/.test(line))
      expect(bad, file).toEqual([])
    }
  })
})
