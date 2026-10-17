import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { ELEMENT_CATEGORIES, ELEMENTS } from '@/lib/elements/registry'
import { WAVE43_ELEMENTS } from '@/lib/elements/wave43Defs'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const cats = new Set(ELEMENT_CATEGORIES.map((c) => c.key))
const TYPES = ['gradient-text', 'split-text', 'highlight-text', 'outline-text', 'count-up', 'draw-line', 'bento-grid']

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'src/components/blocks/elements')
const DEFS = path.join(ROOT, 'src/lib/elements/wave43Defs.ts')
const CSS_PATH = path.join(DIR, 'wave43.css')
const SOURCES = [path.join(DIR, 'Wave43Elements.tsx'), CSS_PATH, DEFS]

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

describe('wave 43 registry', () => {
  it('registers all seven types once, with valid categories', () => {
    const types = ELEMENTS.map((e) => e.type)
    expect(new Set(types).size).toBe(types.length)
    for (const t of TYPES) expect(types.filter((x) => x === t), t).toHaveLength(1)
    for (const e of WAVE43_ELEMENTS) expect(cats.has(e.category), e.type).toBe(true)
    expect(WAVE43_ELEMENTS.map((e) => e.type).sort()).toEqual([...TYPES].sort())
  })

  it('default props only use declared fields, with matching value kinds', () => {
    for (const e of WAVE43_ELEMENTS) {
      const props = e.defaultProps()
      for (const [k, v] of Object.entries(props)) {
        const field = e.fields.find((f) => f.name === k)
        expect(field, `${e.type}.${k}`).toBeDefined()
        if (field!.type === 'number' || field!.type === 'range') expect(typeof v, `${e.type}.${k}`).toBe('number')
        if (field!.type === 'checkbox') expect(typeof v, `${e.type}.${k}`).toBe('boolean')
        if (field!.type === 'text' || field!.type === 'textarea' || field!.type === 'color') expect(typeof v, `${e.type}.${k}`).toBe('string')
        if (field!.type === 'select') expect(field!.options!.map((o) => o.value), `${e.type}.${k}`).toContain(v)
        if (field!.type === 'repeater') expect(Array.isArray(v), `${e.type}.${k}`).toBe(true)
      }
      const names = e.fields.map((f) => f.name)
      expect(new Set(names).size, e.type).toBe(names.length)
      for (const f of e.fields) if (f.type === 'select') expect(f.options?.length, `${e.type}.${f.name}`).toBeGreaterThan(0)
    }
  })

  it('every wave-43 type renders non-empty markup with its defaults and survives empty props', () => {
    for (const e of WAVE43_ELEMENTS) {
      expect(ELEMENT_COMPONENTS[e.type], e.type).toBeDefined()
      const html = render(renderElement(e.type, e.defaultProps()))
      expect(html.length, e.type).toBeGreaterThan(0)
      expect(() => render(renderElement(e.type, {}))).not.toThrow()
    }
  })
})

describe('gradient text', () => {
  it('escapes text and picks the tag', () => {
    const html = render(renderElement('gradient-text', { text: '<img src=x onerror=alert(1)>', tag: 'span' }))
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
    expect(html.startsWith('<span')).toBe(true)
  })

  it('drops invalid colours and writes a gradient from the valid ones', () => {
    const html = render(renderElement('gradient-text', { text: 'Hi', color1: 'red;background:url(x)', color2: '#00a9ff', color3: '' }))
    expect(html).not.toContain('url(x)')
    expect(html).toContain('linear-gradient(90deg, #00a9ff, #00a9ff)')
  })

  it('doubles the stops only when animated', () => {
    const still = render(renderElement('gradient-text', { text: 'Hi', color1: '#000000', color2: '#ffffff', color3: '' }))
    const moving = render(renderElement('gradient-text', { text: 'Hi', color1: '#000000', color2: '#ffffff', animated: true }))
    expect(still).not.toContain('be-el-43-grad--anim')
    expect(moving).toContain('be-el-43-grad--anim')
    expect(moving).toContain('#000000, #ffffff, #000000, #ffffff')
  })
})

describe('split text', () => {
  it('splits by word and gives each piece its index', () => {
    const html = render(renderElement('split-text', { text: 'one two three', by: 'word' }))
    expect(html.match(/be-el-43-split__item/g)).toHaveLength(3)
    expect(html).toContain('--i:2')
    expect(html).toContain('be-el-43-sr')
  })

  it('splits by letter, keeping each word on one line', () => {
    const html = render(renderElement('split-text', { text: 'Hi there', by: 'letter' }))
    expect(html.match(/be-el-43-split__item/g)).toHaveLength(7)
    expect(html.match(/be-el-43-split__word/g)).toHaveLength(2)
  })

  it('animates at most 200 pieces and keeps the rest as plain text', () => {
    const long = 'a'.repeat(260)
    const html = render(renderElement('split-text', { text: long, by: 'letter' }))
    expect(html.match(/be-el-43-split__item/g)).toHaveLength(200)
    expect(html).toContain('--i:199')
    expect(html).not.toContain('--i:200')
    expect(html).toContain('a'.repeat(260))
  })

  it('escapes the text', () => {
    const html = render(renderElement('split-text', { text: '<b>x</b>', by: 'word' }))
    expect(html).not.toContain('<b>x')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('highlight text', () => {
  it('marks only the phrase and renders each marker style', () => {
    for (const style of ['underline', 'underline-wavy', 'box', 'circle']) {
      const html = render(renderElement('highlight-text', { before: 'Our work is', phrase: 'hand made', after: 'small', style, trigger: 'load' }))
      expect(html, style).toContain(`be-el-43-hl--${style}`)
      expect(html, style).toContain('be-el-43-hl--load')
      expect(html.match(/<span class="be-el-43-hl /g), style).toHaveLength(1)
      expect(html).toContain('>hand made</span>')
    }
  })

  it('falls back to the underline and the view trigger for unknown values', () => {
    const html = render(renderElement('highlight-text', { phrase: 'x', style: 'rainbow', trigger: 'never' }))
    expect(html).toContain('be-el-43-hl--underline be-el-43-hl--view')
  })
})

describe('outline text', () => {
  it('sets the stroke and the optional classes', () => {
    const html = render(renderElement('outline-text', { text: 'BIG', stroke: 3, fillOnHover: true, clip: true }))
    expect(html).toContain('--be-el-43-sw:3px')
    expect(html).toContain('be-el-43-outline--hover')
    expect(html).toContain('be-el-43-outline--clip')
    const plain = render(renderElement('outline-text', { text: 'BIG', fillOnHover: false, clip: false }))
    expect(plain).not.toContain('be-el-43-outline--hover')
    expect(plain).not.toContain('be-el-43-outline--clip')
  })
})

describe('count up', () => {
  it('puts the final number in the aria-label with prefix and suffix', () => {
    const html = render(renderElement('count-up', { start: 0, end: 1250, prefix: '$', suffix: '+' }))
    expect(html).toContain('aria-label="$1250+"')
    expect(html).toContain('role="img"')
  })

  it('formats the final number to the chosen decimals and scales the counter', () => {
    const html = render(renderElement('count-up', { start: 1, end: 12.5, decimals: '2' }))
    expect(html).toContain('aria-label="12.50"')
    expect(html).toContain('--be-el-43-k:100')
    expect(html).toContain('--be-el-43-to:1250')
    expect(html).toContain('--be-el-43-from:100')
    expect(html).toContain('be-el-43-count__num--d2')
  })

  it('shows the label below the number', () => {
    expect(render(renderElement('count-up', { end: 5, label: 'Happy customers' }))).toContain('Happy customers')
  })
})

describe('draw line', () => {
  it('draws the chosen shape as a single path with pathLength 1 and hides itself from AT', () => {
    for (const shape of ['wave', 'zigzag', 'loop', 'underline', 'arrow']) {
      const html = render(renderElement('draw-line', { shape, color: '#2e3192', strokeWidth: 4 }))
      expect(html, shape).toContain('pathLength="1"')
      expect(html, shape).toContain('aria-hidden="true"')
      expect(html.match(/<path /g), shape).toHaveLength(1)
    }
  })

  it('falls back to the wave for an unknown shape and refuses a bad colour', () => {
    const html = render(renderElement('draw-line', { shape: 'spiral', color: 'url(evil)' }))
    expect(html).toContain(`d="M0 30 Q25 0 50 30`)
    expect(html).toContain('stroke="#2e3192"')
  })
})

describe('bento grid', () => {
  const tile = (i: number, extra: Record<string, unknown> = {}) => ({ title: `T${i}`, text: 'x', colspan: '1', rowspan: '1', background: '#ffffff', ...extra })

  it('renders at most eight tiles', () => {
    const html = render(renderElement('bento-grid', { tiles: Array.from({ length: 10 }, (_, i) => tile(i)) }))
    expect(html.match(/<li /g)).toHaveLength(8)
  })

  it('clamps spans to 1 or 2', () => {
    const html = render(renderElement('bento-grid', { tiles: [tile(1, { colspan: '3', rowspan: '0' })] }))
    expect(html).toContain('--be-el-43-cs:2')
    expect(html).toContain('--be-el-43-rs:1')
  })

  it('links only safe addresses and uses dark text on dark tiles', () => {
    const html = render(renderElement('bento-grid', { tiles: [tile(1, { href: 'javascript:alert(1)', background: '#000000' }), tile(2, { href: '/shop', background: '#ffffff' })] }))
    expect(html).not.toContain('javascript')
    expect(html).toContain('href="/shop"')
    expect(html).toContain('color:#ffffff')
    expect(html).toContain('color:#1f2230')
  })

  it('renders nothing without tiles', () => {
    expect(render(renderElement('bento-grid', { tiles: [] }))).toBe('')
  })
})

describe('motion and source hygiene', () => {
  it('guards every animation and transition with prefers-reduced-motion: no-preference', () => {
    expect(unguardedMotion(fs.readFileSync(CSS_PATH, 'utf8'))).toEqual([])
  })

  it('keeps the checker honest: an unguarded animation is caught', () => {
    expect(unguardedMotion('.a { animation: x 1s; }')).toHaveLength(1)
    expect(unguardedMotion('@media (prefers-reduced-motion: no-preference) { .a { animation: x 1s; } }')).toEqual([])
  })

  it('keeps the new source files ASCII only', () => {
    for (const file of SOURCES) {
      const bad = fs.readFileSync(file, 'utf8').split('\n').filter((line) => /[^\x00-\x7f]/.test(line))
      expect(bad, path.basename(file)).toEqual([])
    }
  })
})
