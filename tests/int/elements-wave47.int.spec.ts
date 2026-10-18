import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENT_CATEGORIES, ELEMENTS, getElementDef } from '@/lib/elements/registry'
import { WAVE47_ELEMENTS } from '@/lib/elements/wave47Defs'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const cats = new Set(ELEMENT_CATEGORIES.map((c) => c.key))
const OLD_BOXES = ['icon-box', 'image-box', 'flip-box']

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'src/components/blocks/elements')
const DEFS = path.join(ROOT, 'src/lib/elements/wave47Defs.ts')
const CSS_PATH = path.join(DIR, 'wave47.css')
const RENDERER = path.join(DIR, 'Wave47Elements.tsx')
const SPEC = path.join(ROOT, 'tests/int/elements-wave47.int.spec.ts')
const SOURCES = [RENDERER, CSS_PATH, DEFS, SPEC]

/** Declarations that start with "animation" or "transition" (or "transform" in a hover state) outside a reduced-motion guard. */
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

/** Rule headers (selectors) that set a transform, outside a reduced-motion guard. */
function unguardedTransforms(css: string): string[] {
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
      if (prop === 'transform' && !stack.some((h) => h.includes('prefers-reduced-motion: no-preference'))) bad.push(`${prop} in ${stack.join(' > ')}`)
      buf = ''
    } else buf += ch
  }
  return bad
}

describe('wave 47 registry', () => {
  it('registers card once, in marketing, and visible in the library', () => {
    const matches = ELEMENTS.filter((e) => e.type === 'card')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.category).toBe('marketing')
    expect(matches[0]!.hidden).not.toBe(true)
    expect(cats.has(WAVE47_ELEMENTS[0]!.category)).toBe(true)
    expect(WAVE47_ELEMENTS.map((e) => e.type)).toEqual(['card'])
    expect(ELEMENT_COMPONENTS.card).toBeDefined()
  })

  it('hides the three old boxes from the library but keeps their renderers', () => {
    for (const t of OLD_BOXES) {
      expect(getElementDef(t)?.hidden, t).toBe(true)
      expect(ELEMENT_COMPONENTS[t], t).toBeDefined()
      expect(ELEMENTS.filter((e) => e.type === t), t).toHaveLength(1)
    }
    expect(render(renderElement('icon-box', { title: 'Old icon box', icon: 'star' }))).toContain('el-box--icon')
    expect(render(renderElement('image-box', { title: 'Old image box' }))).toContain('el-box--image')
    expect(render(renderElement('flip-box', { frontTitle: 'Old flip', backTitle: 'Back' }))).toContain('el-flip')
  })

  it('default props only use declared fields, with matching value kinds', () => {
    for (const e of WAVE47_ELEMENTS) {
      const props = e.defaultProps()
      for (const [k, v] of Object.entries(props)) {
        const field = e.fields.find((f) => f.name === k)
        expect(field, `${e.type}.${k}`).toBeDefined()
        if (field!.type === 'range') expect(typeof v, `${e.type}.${k}`).toBe('number')
        if (field!.type === 'text' || field!.type === 'textarea' || field!.type === 'color') expect(typeof v, `${e.type}.${k}`).toBe('string')
        if (field!.type === 'select') expect(field!.options!.map((o) => o.value), `${e.type}.${k}`).toContain(v)
      }
      const names = e.fields.map((f) => f.name)
      expect(new Set(names).size, e.type).toBe(names.length)
    }
  })

  it('exposes the requested fields with their option sets', () => {
    const fields = Object.fromEntries(WAVE47_ELEMENTS[0]!.fields.map((f) => [f.name, f]))
    expect(fields.media!.options!.map((o) => o.value)).toEqual(['none', 'icon', 'image'])
    expect(fields.icon!.type).toBe('icon')
    expect(fields.image!.type).toBe('media')
    expect(fields.imageRatio!.options!.map((o) => o.value)).toEqual(['auto', '1:1', '4:3', '16:9'])
    expect(fields.imageFit!.options!.map((o) => o.value)).toEqual(['cover', 'contain'])
    expect(fields.titleTag!.options!.map((o) => o.value)).toEqual(['h2', 'h3', 'h4', 'h5', 'h6', 'p'])
    expect(fields.link!.type).toBe('link')
    expect(fields.layout!.options!.map((o) => o.value)).toEqual(['top', 'left', 'right'])
    expect(fields.align!.options!.map((o) => o.value)).toEqual(['left', 'centre'])
    expect(fields.shadow!.options!.map((o) => o.value)).toEqual(['none', 'sm', 'md', 'lg'])
    expect(fields.hoverEffect!.options!.map((o) => o.value)).toEqual(['none', 'lift', 'zoom-image', 'flip'])
    expect(fields.backColour!.type).toBe('color')
  })

  it('every type renders with its defaults and survives empty props', () => {
    for (const e of WAVE47_ELEMENTS) {
      expect(render(renderElement(e.type, e.defaultProps())).length, e.type).toBeGreaterThan(0)
      expect(() => render(renderElement(e.type, {}))).not.toThrow()
    }
  })
})

describe('card markup', () => {
  it('renders a clean default card: heading, text and no media', () => {
    const html = render(renderElement('card', WAVE47_ELEMENTS[0]!.defaultProps()))
    expect(html.startsWith('<article')).toBe(true)
    expect(html).toContain('<h3 class="be-el-47-card__title">Card title</h3>')
    expect(html).toContain('A short description of this card.')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('be-el-47-card--flip')
  })

  it('returns nothing when there is no content', () => {
    expect(render(renderElement('card', { title: '', text: '', media: 'none' }))).toBe('')
  })

  it('media none: no figure, icon or image', () => {
    const html = render(renderElement('card', { title: 'T', media: 'none', icon: 'star', image: { url: '/a.jpg', alt: 'A' } }))
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('<figure')
    expect(html).not.toContain('<img')
  })

  it('media icon: a decorative svg in the chosen colour and size, no image', () => {
    const html = render(renderElement('card', { title: 'T', media: 'icon', icon: 'leaf', iconSize: 64, iconColour: '#ff0000', image: { url: '/a.jpg' } }))
    expect(html).toContain('be-el-47-card__media--icon')
    expect(html).toContain('width="64"')
    expect(html).toContain('color:#ff0000')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<img')
  })

  it('media icon: falls back to the star for an unknown icon name', () => {
    const html = render(renderElement('card', { title: 'T', media: 'icon', icon: 'not-an-icon' }))
    expect(html).toContain('<svg')
  })

  it('media image: a figure with an img carrying the media alt text and lazy loading', () => {
    const html = render(renderElement('card', { title: 'T', media: 'image', image: { url: 'https://cdn.example.com/a.jpg', alt: 'A bench' } }))
    expect(html).toContain('<figure class="be-el-47-card__media be-el-47-card__media--image"')
    expect(html).toContain('src="https://cdn.example.com/a.jpg"')
    expect(html).toContain('alt="A bench"')
    expect(html).toContain('loading="lazy"')
  })

  it('media image without a usable url renders no picture', () => {
    const html = render(renderElement('card', { title: 'T', media: 'image', image: { url: 'javascript:alert(1)' } }))
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript')
  })

  it('image shape sets an aspect ratio, auto leaves it alone, and fit picks the class', () => {
    const ratio = render(renderElement('card', { title: 'T', media: 'image', image: '/a.jpg', imageRatio: '4:3', imageFit: 'contain' }))
    expect(ratio).toContain('aspect-ratio:4 / 3')
    expect(ratio).toContain('be-el-47-card__img--contain')
    const auto = render(renderElement('card', { title: 'T', media: 'image', image: '/a.jpg', imageRatio: 'auto' }))
    expect(auto).not.toContain('aspect-ratio')
    expect(auto).toContain('be-el-47-card__img--cover')
    const bad = render(renderElement('card', { title: 'T', media: 'image', image: '/a.jpg', imageRatio: '21:9', imageFit: 'stretch' }))
    expect(bad).toContain('aspect-ratio:16 / 9')
    expect(bad).toContain('be-el-47-card__img--cover')
  })

  it('layout and alignment set classes and fall back for unknown values', () => {
    expect(render(renderElement('card', { title: 'T', layout: 'left' }))).toContain('be-el-47-card__front--left')
    expect(render(renderElement('card', { title: 'T', layout: 'right' }))).toContain('be-el-47-card__front--right')
    expect(render(renderElement('card', { title: 'T', layout: 'diagonal' }))).toContain('be-el-47-card__front--top')
    expect(render(renderElement('card', { title: 'T', align: 'centre' }))).toContain('be-el-47-card--centre')
    expect(render(renderElement('card', { title: 'T', align: 'right' }))).not.toContain('be-el-47-card--centre')
  })

  it('title tag picks the heading level, defaults to h3, and accepts p', () => {
    expect(render(renderElement('card', { title: 'T', titleTag: 'h5' }))).toContain('<h5 class="be-el-47-card__title">T</h5>')
    expect(render(renderElement('card', { title: 'T', titleTag: 'p' }))).toContain('<p class="be-el-47-card__title">T</p>')
    expect(render(renderElement('card', { title: 'T', titleTag: 'div' }))).toContain('<h3 class="be-el-47-card__title">T</h3>')
  })

  it('escapes every text field', () => {
    const html = render(renderElement('card', { title: '<img src=x onerror=alert(1)>', text: '<b>bold</b>', linkLabel: '<i>x</i>', link: '/go', backTitle: '<s>b</s>', hoverEffect: 'flip', backText: '<u>u</u>' }))
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;b&gt;bold')
    expect(html).toContain('&lt;s&gt;b')
  })

  it('drops invalid colours and sets text colour that matches a valid background', () => {
    const bad = render(renderElement('card', { title: 'T', bgColour: 'red;background:url(x)' }))
    expect(bad).not.toContain('url(x)')
    expect(bad).not.toContain('background:red')
    const light = render(renderElement('card', { title: 'T', bgColour: '#ffffff' }))
    expect(light).toContain('background:#ffffff')
    expect(light).toContain('color:#1a1a1a')
    const dark = render(renderElement('card', { title: 'T', bgColour: '#102030' }))
    expect(dark).toContain('color:#ffffff')
  })

  it('applies the corner radius and shadow class, clamped', () => {
    const html = render(renderElement('card', { title: 'T', borderRadius: 99, shadow: 'lg' }))
    expect(html).toContain('--be-el-47-r:40px')
    expect(html).toContain('be-el-47-card--shadow-lg')
    expect(render(renderElement('card', { title: 'T', shadow: 'none' }))).not.toContain('be-el-47-card--shadow')
  })
})

describe('card link', () => {
  it('wraps the whole card in one anchor with a title label and no nested anchors', () => {
    const html = render(renderElement('card', { title: 'Read me', text: 'Body', link: { url: '/read' }, linkLabel: 'Read more', media: 'icon', hoverEffect: 'flip', backTitle: 'Back', backText: 'More' }))
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('href="/read"')
    expect(html).toContain('aria-label="Read me"')
    expect(html).toContain('be-el-47-card__more">Read more</span>')
    expect(html).not.toContain('tabindex')
  })

  it('a card with no link has no anchor', () => {
    const html = render(renderElement('card', { title: 'T', text: 'Body', linkLabel: 'Read more' }))
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('Read more')
  })

  it('opens in a new tab with noopener noreferrer and nofollow when asked', () => {
    const html = render(renderElement('card', { title: 'T', link: { url: 'https://example.com', newTab: true, nofollow: true } }))
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('drops an unsafe scheme entirely, leaving no anchor', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'vbscript:msgbox', '//evil.example/x']) {
      const html = render(renderElement('card', { title: 'T', text: 'Body', link: { url }, linkLabel: 'Go' }))
      expect(html, url).not.toContain('<a ')
      expect(html, url).not.toContain('javascript')
      expect(html, url).not.toContain('evil.example')
    }
  })

  it('keeps a root-relative link and an https link', () => {
    expect(render(renderElement('card', { title: 'T', link: '/about' }))).toContain('href="/about"')
    expect(render(renderElement('card', { title: 'T', link: 'https://example.com/x' }))).toContain('href="https://example.com/x"')
  })
})

describe('card hover effects', () => {
  it('lift and zoom-image add their class and nothing else', () => {
    expect(render(renderElement('card', { title: 'T', hoverEffect: 'lift' }))).toContain('be-el-47-card--lift')
    expect(render(renderElement('card', { title: 'T', hoverEffect: 'zoom-image', media: 'image', image: '/a.jpg' }))).toContain('be-el-47-card--zoom')
  })

  it('flip renders two faces in one wrapper, both with their text', () => {
    const html = render(renderElement('card', { title: 'Front', text: 'Front text', hoverEffect: 'flip', backTitle: 'Back', backText: 'Back text' }))
    expect(html).toContain('be-el-47-card--flip')
    expect(html).toContain('be-el-47-card__faces')
    expect(html).toContain('be-el-47-card__face--front')
    expect(html).toContain('be-el-47-card__face--back')
    expect(html).toContain('Front text')
    expect(html).toContain('Back text')
    // The back face is turned away by CSS, never hidden from assistive tech.
    expect(html).not.toContain('aria-hidden')
    expect(html).not.toContain('hidden=')
    expect(html.indexOf('be-el-47-card__face--front')).toBeLessThan(html.indexOf('be-el-47-card__face--back'))
  })

  it('flip without any back content falls back to no effect', () => {
    const html = render(renderElement('card', { title: 'T', hoverEffect: 'flip', backTitle: '', backText: '' }))
    expect(html).not.toContain('be-el-47-card--flip')
    expect(html).not.toContain('be-el-47-card__face--back')
  })

  it('a flip with no link gets a tab stop so keyboard users can reach it', () => {
    const html = render(renderElement('card', { title: 'T', hoverEffect: 'flip', backTitle: 'B' }))
    expect(html).toContain('tabindex="0"')
    expect(html).not.toContain('<a ')
  })

  it('a flip with a link keeps the link as the focus stop, without a tab index on the card', () => {
    const html = render(renderElement('card', { title: 'T', hoverEffect: 'flip', backTitle: 'B', link: '/x' }))
    expect(html).not.toContain('tabindex')
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('colours the back face from its own colour and uses the flip default when empty', () => {
    const html = render(renderElement('card', { title: 'T', hoverEffect: 'flip', backTitle: 'B', backColour: '#00ff00' }))
    expect(html).toContain('background:#00ff00')
    const none = render(renderElement('card', { title: 'T', hoverEffect: 'flip', backTitle: 'B', backColour: '' }))
    expect(none).toContain('background:#2e3192')
  })
})

describe('card styles', () => {
  const CSS = fs.readFileSync(CSS_PATH, 'utf8')

  it('guards every animation, transition and transform with prefers-reduced-motion: no-preference', () => {
    expect(unguardedMotion(CSS)).toEqual([])
    expect(unguardedTransforms(CSS)).toEqual([])
  })

  it('keeps the checker honest: an unguarded animation or transform is caught', () => {
    expect(unguardedMotion('.a { animation: x 1s; }')).toHaveLength(1)
    expect(unguardedMotion('@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } }')).toEqual([])
    expect(unguardedTransforms('.a:hover { transform: scale(2); }')).toHaveLength(1)
    expect(unguardedTransforms('@media (prefers-reduced-motion: no-preference) { .a:hover { transform: scale(2); } }')).toEqual([])
  })

  it('stacks the flip back below the front without motion, and reflows left and right layouts under 640px', () => {
    expect(CSS).toContain('.be-el-47-card__faces {\n  display: flex;\n  flex-direction: column;')
    expect(CSS).toContain('@media (max-width: 639.98px)')
  })

  it('scopes every selector with .be-el-47-', () => {
    const selectors = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((s) => s.split('}').pop()!.trim())
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@'))
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) expect(sel.startsWith('.be-el-47-card'), sel).toBe(true)
  })
})

describe('source hygiene', () => {
  it('keeps the new source files ASCII only', () => {
    for (const file of SOURCES) {
      const bad = fs.readFileSync(file, 'utf8').split('\n').filter((line) => /[^\x00-\x7f]/.test(line))
      expect(bad, file).toEqual([])
    }
  })

  it('contains no literal backslash-u escapes in the new source files', () => {
    for (const file of SOURCES.filter((f) => f !== SPEC)) {
      expect(fs.readFileSync(file, 'utf8').includes('\\u'), file).toBe(false)
    }
  })
})
