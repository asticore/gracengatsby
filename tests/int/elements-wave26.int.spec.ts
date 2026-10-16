import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { renderElement } from '@/components/blocks/elements/renderElement'
import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { cells, mapEmbedSrc, parseVideoUrl, sanitizeHtml } from '@/components/blocks/elements/elementUtil'
import { splitDuration } from '@/components/blocks/elements/CountdownElement'
import { ELEMENT_CATEGORIES, ELEMENTS } from '@/lib/elements/registry'
import { WAVE26_ELEMENTS } from '@/lib/elements/wave26Defs'
import { BLOCK_CATEGORIES, libraryCards } from '@/views/visualEditor/blockSchemas'

const render = (node: React.ReactNode) => renderToStaticMarkup(React.createElement(React.Fragment, null, node))
const cats = new Set(ELEMENT_CATEGORIES.map((c) => c.key))

describe('element registry', () => {
  it('has unique types and valid categories', () => {
    const types = ELEMENTS.map((e) => e.type)
    expect(new Set(types).size).toBe(types.length)
    for (const e of ELEMENTS) expect(cats.has(e.category)).toBe(true)
    expect(WAVE26_ELEMENTS.length).toBeGreaterThanOrEqual(30)
  })

  it('default props only use declared fields, with matching value kinds', () => {
    for (const e of WAVE26_ELEMENTS) {
      const names = new Set(e.fields.map((f) => f.name))
      expect(new Set(e.fields.map((f) => f.name)).size).toBe(e.fields.length)
      const props = e.defaultProps()
      for (const [k, v] of Object.entries(props)) {
        const field = e.fields.find((f) => f.name === k)
        expect(field, `${e.type}.${k}`).toBeDefined()
        if (field!.type === 'number') expect(typeof v).toBe('number')
        if (field!.type === 'checkbox') expect(typeof v).toBe('boolean')
        if (field!.type === 'text' || field!.type === 'textarea') expect(typeof v).toBe('string')
        if (field!.type === 'mediaMulti') expect(Array.isArray(v)).toBe(true)
        if (field!.type === 'select') expect(field!.options!.map((o) => o.value)).toContain(v)
      }
      for (const f of e.fields) if (f.type === 'select') expect(f.options?.length).toBeGreaterThan(0)
      expect(names.size).toBe(e.fields.length)
    }
  })

  it('every wave-26 type has a renderer that renders non-empty markup', () => {
    for (const e of WAVE26_ELEMENTS) {
      expect(ELEMENT_COMPONENTS[e.type], e.type).toBeDefined()
      const node = renderElement(e.type, e.defaultProps())
      expect(node, e.type).not.toBeNull()
      const html = render(node)
      // anchor is intentionally an empty marker div; everything else prints text or markup
      expect(html.length, e.type).toBeGreaterThan(0)
    }
  })

  it('renders without throwing on empty props', () => {
    for (const e of WAVE26_ELEMENTS) expect(() => render(renderElement(e.type, {}))).not.toThrow()
  })

  it('shows one library section per element category', () => {
    const keys = new Set(libraryCards().map((c) => c.category))
    for (const k of keys) expect(BLOCK_CATEGORIES.some((c) => c.key === k), String(k)).toBe(true)
    expect(keys.has('el:text')).toBe(true)
    expect(keys.has('el:interactive')).toBe(true)
  })
})

describe('html sanitiser', () => {
  it('strips script, iframe, style, forms and event handlers', () => {
    const out = sanitizeHtml(
      '<p onclick="x()">Hi</p><script>alert(1)</script><IFRAME src="https://evil"></IFRAME><img src="/a.png" onerror="alert(1)"><style>p{}</style><form><input></form>',
    )
    expect(out).toContain('<p>Hi</p>')
    expect(out).toContain('<img src="/a.png">')
    expect(out).not.toMatch(/script|iframe|onerror|onclick|<style|<form|alert/i)
  })

  it('refuses javascript: and data: links, including entity tricks', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="java&#115;cript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<a href="jav&Tab;ascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<img src="data:text/html;base64,AAAA">')).toBe('<img>')
  })

  it('keeps safe links and adds rel for new tabs', () => {
    expect(sanitizeHtml('<a href="https://ok.test/" target="_blank">x</a>')).toBe('<a href="https://ok.test/" target="_blank" rel="noopener noreferrer">x</a>')
  })

  it('neutralises broken and nested markup', () => {
    expect(sanitizeHtml('<scr<script>ipt>alert(1)</scr</script>ipt>')).not.toMatch(/<script/i)
    expect(sanitizeHtml('<img src=x onerror=alert(1)')).not.toMatch(/<img/i)
    expect(sanitizeHtml('<b <script>alert(1)</script>>x</b>')).not.toMatch(/<script|alert/i)
    expect(sanitizeHtml('<svg onload=alert(1)><circle/></svg>')).not.toMatch(/svg|onload/i)
  })

  it('renders through the html element', () => {
    const html = render(renderElement('html', { html: '<p>ok</p><script>bad()</script>' }))
    expect(html).toContain('<p>ok</p>')
    expect(html).not.toContain('script')
  })
})

describe('embeds', () => {
  it('maps YouTube and Vimeo links to privacy-friendly embeds', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(parseVideoUrl('https://vimeo.com/123456789')?.src).toBe('https://player.vimeo.com/video/123456789?dnt=1')
    expect(parseVideoUrl('https://x.test/a.mp4')?.kind).toBe('file')
    expect(parseVideoUrl('https://evil.test/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseVideoUrl('javascript:alert(1)')).toBeNull()
  })

  it('only embeds allow-listed map hosts', () => {
    expect(mapEmbedSrc('', 'https://evil.test/maps')).toBeNull()
    expect(mapEmbedSrc('', 'https://www.google.com/maps/embed?pb=abc')).toContain('google.com/maps/embed')
    expect(mapEmbedSrc('10 High Street')).toContain('https://www.google.com/maps?q=10%20High%20Street')
    expect(mapEmbedSrc('51.5,-0.12')).toContain('openstreetmap.org/export/embed.html')
    expect(mapEmbedSrc('', 'https://evil.test/x', 14)).toBeNull()
  })

  it('renders the video and map iframes with the safe sources only', () => {
    expect(render(renderElement('video', { url: 'https://youtu.be/dQw4w9WgXcQ' }))).toContain('youtube-nocookie.com')
    expect(render(renderElement('video', { url: 'https://evil.test/x' }))).not.toContain('<iframe')
  })
})

describe('parsing and small helpers', () => {
  it('splits cells on the first separators only', () => {
    expect(cells('A | B | C | D\nOnly', 3)).toEqual([['A', 'B', 'C | D'], ['Only']])
  })
  it('splits a duration', () => {
    expect(splitDuration(90061000)).toEqual({ d: 1, h: 1, m: 1, s: 1 })
    expect(splitDuration(-5)).toEqual({ d: 0, h: 0, m: 0, s: 0 })
  })
  it('does not render unsafe links', () => {
    expect(render(renderElement('icon-box', { title: 'x', link: 'javascript:alert(1)' }))).not.toContain('javascript')
    expect(render(renderElement('social-icons', { items: 'x | javascript:alert(1)' }))).not.toContain('javascript')
  })
  it('keeps tabs and accordion content', () => {
    const tabs = render(renderElement('tabs', { items: 'One | First\nTwo | Second' }))
    expect(tabs).toContain('First')
    expect(tabs).toContain('Two')
    expect(render(renderElement('accordion', { items: 'Q | A' }))).toContain('<details')
  })
})
