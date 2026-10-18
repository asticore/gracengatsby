import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { WAVE48_COMPONENTS } from '@/components/blocks/elements/Wave48Elements'
import { WAVE48_ELEMENTS } from '@/lib/elements/wave48Defs'

// Imported directly rather than through the registry, so this spec does not depend on the lead's registration step.
const CATEGORIES = new Set(['text', 'media', 'interactive', 'marketing', 'layout', 'commerce', 'siteMeta', 'formFields'])
const ELLIPSIS = String.fromCodePoint(0x2026)

const render = (type: string, props: Record<string, unknown>): string => {
  const Component = WAVE48_COMPONENTS[type]
  if (!Component) throw new Error(`no component for ${type}`)
  return renderToStaticMarkup(React.createElement(Component, props))
}
const count = (html: string, needle: string) => html.split(needle).length - 1

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'src/components/blocks/elements')
const DEFS = path.join(ROOT, 'src/lib/elements/wave48Defs.ts')
const CSS_PATH = path.join(DIR, 'wave48.css')
const RENDERER = path.join(DIR, 'Wave48Elements.tsx')
const SPEC = path.join(ROOT, 'tests/int/elements-wave48.int.spec.ts')
const SOURCES = [RENDERER, CSS_PATH, DEFS, SPEC]

/** Declarations that start with "animation" or "transition" outside a reduced-motion guard. */
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

/** Declarations that set a transform outside a reduced-motion guard. */
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

describe('wave 48 registry shape', () => {
  it('defines chart, embed, reviews and pagination once each, in valid categories', () => {
    expect(WAVE48_ELEMENTS.map((e) => e.type)).toEqual(['chart', 'embed', 'reviews', 'pagination'])
    for (const e of WAVE48_ELEMENTS) {
      expect(CATEGORIES.has(e.category), e.type).toBe(true)
      expect(e.label.length, e.type).toBeGreaterThan(0)
      expect(e.icon.length, e.type).toBeGreaterThan(0)
      expect(WAVE48_COMPONENTS[e.type], e.type).toBeDefined()
      expect(e.hidden, e.type).not.toBe(true)
    }
  })

  it('default props only use declared fields, with matching value kinds', () => {
    for (const e of WAVE48_ELEMENTS) {
      const props = e.defaultProps()
      for (const [k, v] of Object.entries(props)) {
        const field = e.fields.find((f) => f.name === k)
        expect(field, `${e.type}.${k}`).toBeDefined()
        if (field!.type === 'range' || field!.type === 'number') expect(typeof v, `${e.type}.${k}`).toBe('number')
        if (field!.type === 'text' || field!.type === 'textarea') expect(typeof v, `${e.type}.${k}`).toBe('string')
        if (field!.type === 'checkbox') expect(typeof v, `${e.type}.${k}`).toBe('boolean')
        if (field!.type === 'select') expect(field!.options!.map((o) => o.value), `${e.type}.${k}`).toContain(v)
        if (field!.type === 'repeater') expect(Array.isArray(v), `${e.type}.${k}`).toBe(true)
      }
      const names = e.fields.map((f) => f.name)
      expect(new Set(names).size, e.type).toBe(names.length)
    }
  })

  it('exposes the requested option sets', () => {
    const byType = Object.fromEntries(WAVE48_ELEMENTS.map((e) => [e.type, Object.fromEntries(e.fields.map((f) => [f.name, f]))]))
    expect(byType.chart!.chartType!.options!.map((o) => o.value)).toEqual(['bar', 'line', 'pie', 'radar', 'polar'])
    expect(byType.embed!.provider!.options!.map((o) => o.value)).toEqual(['youtube', 'vimeo', 'x', 'instagram', 'facebook-video', 'google-calendar', 'typeform', 'custom-iframe'])
    expect(byType.reviews!.layout!.options!.map((o) => o.value)).toEqual(['grid', 'list'])
    expect(byType.reviews!.items!.type).toBe('repeater')
    expect(byType.pagination!.align!.options!.map((o) => o.value)).toEqual(['left', 'centre', 'right'])
  })

  it('every type renders with its defaults and survives empty props', () => {
    for (const e of WAVE48_ELEMENTS) {
      expect(render(e.type, e.defaultProps()).length, e.type).toBeGreaterThan(0)
      expect(() => render(e.type, {})).not.toThrow()
    }
  })
})

describe('chart', () => {
  const data = 'Jan | 120\nFeb | 95\nMar | 160\nApr | 140'

  it('renders the default bar chart with an accessible name and a data table', () => {
    const html = render('chart', WAVE48_ELEMENTS[0]!.defaultProps())
    expect(html).toContain('<figure class="be-el-48-chart be-el-48-chart--bar">')
    expect(html).toContain('role="img" aria-label="Sales by month"')
    expect(count(html, '<rect')).toBe(4)
    expect(html).toContain('<table class="be-el-48-sr">')
    expect(count(html, '<th scope="row">')).toBe(4)
    expect(html).not.toContain('be-el-48-chart__legend')
  })

  it('draws each chart type with its own shape', () => {
    expect(render('chart', { chartType: 'line', data })).toContain('<polyline')
    expect(render('chart', { chartType: 'pie', data })).toContain('be-el-48-chart--pie')
    expect(render('chart', { chartType: 'pie', data })).toContain('<path')
    expect(render('chart', { chartType: 'radar', data })).toContain('<polygon')
    expect(render('chart', { chartType: 'polar', data })).toContain('<path')
    expect(render('chart', { chartType: 'unknown', data })).toContain('be-el-48-chart--bar')
  })

  it('skips rows with bad numbers and keeps at most 12 points', () => {
    const html = render('chart', { data: 'A | 5\nB | x\nC |\nD | 1e3\nE | Infinity' })
    expect(count(html, '<th scope="row">')).toBe(2)
    expect(html).toContain('<th scope="row">D</th>')
    const many = Array.from({ length: 15 }, (_, i) => `L${i} | ${i + 1}`).join('\n')
    expect(count(render('chart', { data: many }), '<th scope="row">')).toBe(12)
  })

  it('renders nothing for no data, or a pie with no positive total', () => {
    expect(render('chart', { data: '' })).toBe('')
    expect(render('chart', { chartType: 'pie', data: 'A | 0\nB | 0' })).toBe('')
  })

  it('drops invalid colours and falls back to the default colour', () => {
    const html = render('chart', { data: 'A | 1', colors: 'red;background:url(x)' })
    expect(html).not.toContain('url(x)')
    expect(html).toContain('fill="#2e3192"')
  })

  it('uses the supplied colours in turn', () => {
    const html = render('chart', { data: 'A | 1\nB | 2', colors: '#ff0000, nope, #00ff00' })
    expect(html).toContain('fill="#ff0000"')
    expect(html).toContain('fill="#00ff00"')
  })

  it('shows the legend and values only when asked', () => {
    expect(render('chart', { data, showLegend: true })).toContain('be-el-48-chart__legend')
    expect(render('chart', { data, showValues: false })).not.toContain('be-el-48-chart__value')
    expect(render('chart', { data, chartType: 'pie', showLegend: true })).toContain('(')
  })

  it('escapes the title and labels', () => {
    const html = render('chart', { title: '<img src=x onerror=alert(1)>', data: '<b>bold</b> | 3' })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<b>bold')
  })
})

describe('embed', () => {
  const iframeFor = (provider: string, url: string, extra: Record<string, unknown> = {}) => render('embed', { provider, url, title: 'Clip', ...extra })

  it('builds a YouTube iframe on the no-cookie host, lazy, sandboxed and with a referrer policy', () => {
    const html = iframeFor('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('sandbox="')
    expect(html).toContain('referrerPolicy="strict-origin-when-cross-origin"')
    expect(html).toContain('title="Clip"')
  })

  it('accepts youtu.be and shorts addresses', () => {
    expect(iframeFor('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ')
    expect(iframeFor('youtube', 'https://www.youtube.com/shorts/dQw4w9WgXcQ')).toContain('/embed/dQw4w9WgXcQ')
  })

  it('builds Vimeo, Google Calendar and Typeform iframes from their fixed hosts', () => {
    expect(iframeFor('vimeo', 'https://vimeo.com/123456789')).toContain('src="https://player.vimeo.com/video/123456789?dnt=1"')
    expect(iframeFor('google-calendar', 'https://calendar.google.com/calendar/embed?src=a%40b.c')).toContain('src="https://calendar.google.com/calendar/embed?src=a%40b.c"')
    expect(iframeFor('typeform', 'https://form.typeform.com/to/abc123')).toContain('src="https://form.typeform.com/to/abc123"')
  })

  it('refuses addresses from hosts outside the provider allowlist, with a plain message and no iframe', () => {
    const html = iframeFor('youtube', 'https://evil.example/watch?v=dQw4w9WgXcQ')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('This address is not from a host this embed allows')
    expect(iframeFor('vimeo', 'https://youtube.com/watch?v=dQw4w9WgXcQ')).not.toContain('<iframe')
    expect(iframeFor('typeform', 'https://evil.example/to/abc')).not.toContain('<iframe')
  })

  it('refuses non-https addresses', () => {
    const html = iframeFor('youtube', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(html).not.toContain('<iframe')
    expect(html).toContain('Use an https:// address.')
  })

  it('refuses javascript and data addresses', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi']) {
      const html = iframeFor('custom-iframe', url)
      expect(html, url).not.toContain('<iframe')
      expect(html, url).not.toContain('javascript:alert')
    }
  })

  it('custom iframe accepts any allowlisted iframe host, and rejects other hosts', () => {
    expect(iframeFor('custom-iframe', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toContain('<iframe')
    expect(iframeFor('custom-iframe', 'https://evil.example/page')).not.toContain('<iframe')
  })

  it('renders X, Instagram and Facebook as a link card with no iframe', () => {
    const x = iframeFor('x', 'https://x.com/user/status/1')
    expect(x).not.toContain('<iframe')
    expect(x).toContain('href="https://x.com/user/status/1"')
    expect(x).toContain('target="_blank"')
    expect(x).toContain('rel="noopener noreferrer"')
    expect(iframeFor('instagram', 'https://www.instagram.com/p/abc/')).toContain('Open on Instagram')
    expect(iframeFor('facebook-video', 'https://fb.watch/abc/')).toContain('Open on Facebook')
    expect(iframeFor('x', 'https://evil.example/post')).not.toContain('<a ')
  })

  it('uses the provider name as the iframe title when none is given, and the aspect ratio class', () => {
    const html = render('embed', { provider: 'vimeo', url: 'https://vimeo.com/123456789', title: '', ratio: '4:3' })
    expect(html).toContain('title="Vimeo"')
    expect(html).toContain('aspect-ratio:4 / 3')
  })

  it('renders nothing for an empty address', () => {
    expect(render('embed', { provider: 'youtube', url: '' })).toBe('')
  })

  it('escapes the title', () => {
    expect(iframeFor('youtube', 'https://youtu.be/dQw4w9WgXcQ', { title: '"><script>x</script>' })).not.toContain('<script>x')
  })
})

describe('reviews', () => {
  const items = [
    { name: 'Priya', rating: '5', text: 'Great', source: 'Google' },
    { name: 'Tom', rating: '5', text: 'Good', source: 'Google' },
    { name: 'Ana', rating: '4', text: 'Fine', source: 'Trustpilot' },
  ]

  it('renders the default grid with one star row per rated review', () => {
    const html = render('reviews', WAVE48_ELEMENTS[2]!.defaultProps())
    expect(html).toContain('be-el-48-reviews--grid')
    expect(count(html, '<li>')).toBe(3)
    expect(html).toContain('aria-label="5 out of 5"')
    expect(html).toContain('aria-label="4 out of 5"')
    expect(html).toContain('Average 4.7 out of 5 from 3 reviews')
  })

  it('hides stars when asked, and shows the list layout', () => {
    const html = render('reviews', { items, showStars: false, layout: 'list' })
    expect(html).not.toContain('<svg')
    expect(html).toContain('be-el-48-reviews--list')
  })

  it('clamps ratings to 1 to 5 and shows unrated reviews without stars or in the average', () => {
    const html = render('reviews', { items: [{ name: 'A', rating: '9' }, { name: 'B', rating: '0' }, { name: 'C' }] })
    expect(count(html, '<svg')).toBe(1)
    expect(html).toContain('aria-label="5 out of 5"')
    expect(html).toContain('Average 5.0 out of 5 from 1 review')
  })

  it('adds no JSON-LD unless asked, and the item has a name', () => {
    expect(render('reviews', { items })).not.toContain('application/ld+json')
    expect(render('reviews', { items, jsonLd: true })).not.toContain('application/ld+json')
    expect(render('reviews', { items, jsonLd: true, itemName: '' })).not.toContain('application/ld+json')
  })

  it('adds Review JSON-LD with the computed aggregate when asked', () => {
    const html = render('reviews', { items, jsonLd: true, itemName: 'Candles' })
    expect(html).toContain('<script type="application/ld+json">')
    const json = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!) as {
      aggregateRating: { ratingValue: number; reviewCount: number }
      review: unknown[]
    }
    expect(json.aggregateRating.ratingValue).toBe(4.7)
    expect(json.aggregateRating.reviewCount).toBe(3)
    expect(json.review).toHaveLength(3)
  })

  it('keeps review text from ending the script element early', () => {
    const html = render('reviews', { items: [{ name: 'X', rating: '5', text: '</script><b>hi</b>' }], jsonLd: true, itemName: 'Item' })
    expect(count(html, '</script>')).toBe(1)
    expect(html).not.toContain('</script><b>')
  })

  it('escapes names and text in the markup', () => {
    const html = render('reviews', { items: [{ name: '<i>n</i>', rating: '3', text: '<u>t</u>' }] })
    expect(html).not.toContain('<i>n</i>')
    expect(html).toContain('&lt;i&gt;n')
  })

  it('shows an avatar only when it has a usable url', () => {
    const withUrl = render('reviews', { items: [{ name: 'A', rating: '5', avatar: { url: 'https://cdn.example.com/a.jpg', alt: 'A' } }] })
    expect(withUrl).toContain('src="https://cdn.example.com/a.jpg"')
    const bad = render('reviews', { items: [{ name: 'A', rating: '5', avatar: { url: 'javascript:alert(1)' } }] })
    expect(bad).not.toContain('<img')
  })

  it('renders nothing for no reviews', () => {
    expect(render('reviews', { items: [] })).toBe('')
    expect(render('reviews', { items: 'nope' })).toBe('')
  })
})

describe('pagination', () => {
  it('marks the current page, links the others and labels the nav', () => {
    const html = render('pagination', WAVE48_ELEMENTS[3]!.defaultProps())
    expect(html).toContain('<nav class="be-el-48-pagination be-el-48-pagination--centre" aria-label="Pagination">')
    expect(count(html, 'aria-current="page"')).toBe(1)
    expect(html).toContain('href="?page=2"')
    expect(html).toContain('href="?page=4"')
    expect(html).toContain('href="?page=12"')
    expect(html).not.toContain('href="?page=6"')
  })

  it('uses ellipses for gaps in the middle, with links on both sides of the current page', () => {
    const html = render('pagination', { current: 6, total: 20, maxLinks: 7 })
    expect(count(html, ELLIPSIS)).toBe(2)
    for (const n of [1, 5, 7, 20]) expect(html, `page ${n}`).toContain(`href="?page=${n}"`)
    expect(html).not.toContain('href="?page=4"')
    expect(html).toContain('aria-current="page">6<')
  })

  it('shows the end pages when the current page is near the end', () => {
    const html = render('pagination', { current: 19, total: 20, maxLinks: 7 })
    for (const n of [1, 16, 17, 18, 20]) expect(html, `page ${n}`).toContain(`href="?page=${n}"`)
    expect(html).not.toContain('href="?page=15"')
    expect(html).toContain('rel="next"')
  })

  it('never shows more items than maxLinks allows (page numbers and gaps, not prev and next)', () => {
    for (const max of [5, 6, 7, 9, 11]) {
      for (const current of [1, 3, 4, 5, 10, 16, 17, 18, 20]) {
        const html = render('pagination', { current, total: 20, maxLinks: max })
        // Every list item is one of: prev, next, a page number or a gap. Two of them are prev and next.
        expect(count(html, '<li>') - 2, `max ${max} current ${current}`).toBeLessThanOrEqual(max)
        expect(html, `max ${max} current ${current}`).toContain(`aria-current="page">${current}<`)
      }
    }
  })

  it('renders nothing for one page or fewer', () => {
    expect(render('pagination', { current: 1, total: 1 })).toBe('')
    expect(render('pagination', { current: 1, total: 0 })).toBe('')
  })

  it('clamps the current page into range', () => {
    const html = render('pagination', { current: 99, total: 5 })
    expect(html).toContain('aria-current="page">5<')
    expect(html).toContain('aria-disabled="true"')
  })

  it('builds links from a custom pattern with the token replaced by the integer', () => {
    const html = render('pagination', { current: 2, total: 4, baseUrl: '/blog/page/{page}' })
    expect(html).toContain('href="/blog/page/1"')
    expect(html).toContain('href="/blog/page/3"')
    expect(html).toContain('href="/blog/page/4"')
  })

  it('falls back to the default pattern when the token is missing', () => {
    expect(render('pagination', { current: 2, total: 4, baseUrl: '/plain' })).toContain('href="?page=3"')
  })

  it('writes no link for an unsafe pattern', () => {
    for (const baseUrl of ['//evil.example/{page}', 'javascript:alert({page})', 'data:text/html,{page}']) {
      const html = render('pagination', { current: 2, total: 4, baseUrl })
      expect(html, baseUrl).not.toContain('<a ')
      expect(html, baseUrl).not.toContain('evil')
      expect(html, baseUrl).not.toContain('javascript')
    }
  })

  it('uses custom labels and alignment', () => {
    const html = render('pagination', { current: 2, total: 4, prevLabel: 'Back', nextLabel: 'Forward', align: 'right' })
    expect(html).toContain('>Back<')
    expect(html).toContain('>Forward<')
    expect(html).toContain('be-el-48-pagination--right')
  })
})

describe('motion and styles', () => {
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

  it('scopes every selector with .be-el-48-', () => {
    const selectors = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((s) => s.split('}').pop()!.trim())
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@') && !s.endsWith('%') && s !== 'from' && s !== 'to')
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) expect(sel.startsWith('.be-el-48-') || sel.startsWith('a.be-el-48-'), sel).toBe(true)
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
