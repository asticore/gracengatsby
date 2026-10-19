import fs from 'node:fs'
import path from 'node:path'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ELEMENT_COMPONENTS } from '@/components/blocks/elements/elementComponents'
import { renderElement } from '@/components/blocks/elements/renderElement'
import { WAVE49_COMPONENTS } from '@/components/blocks/elements/Wave49Elements'
import { ELEMENT_CATEGORIES, getElementDef } from '@/lib/elements/registry'
import { WAVE49_ELEMENTS } from '@/lib/elements/wave49Defs'

const GALLERY = WAVE49_COMPONENTS.gallery as React.ComponentType<Record<string, unknown>>
const render = (props: Record<string, unknown>) => renderToStaticMarkup(React.createElement(GALLERY, props))
const mount = (props: Record<string, unknown>) => rtlRender(React.createElement(GALLERY, props))
const cats = new Set(ELEMENT_CATEGORIES.map((c) => c.key))
const OLD_PICTURES = ['image-gallery', 'image-carousel', 'logo-strip']

const URLS = [
  'https://cdn.example.com/a.jpg | First picture',
  'https://cdn.example.com/b.jpg | Second picture',
  'https://cdn.example.com/c.jpg | Third picture',
].join('\n')
const THREE = { urls: URLS }

const ROOT = process.cwd()
const DIR = path.join(ROOT, 'src/components/blocks/elements')
const DEFS = path.join(ROOT, 'src/lib/elements/wave49Defs.ts')
const CSS_PATH = path.join(DIR, 'wave49.css')
const RENDERER = path.join(DIR, 'Wave49Elements.tsx')
const CLIENT = path.join(DIR, 'Wave49Client.tsx')
const SPEC = path.join(ROOT, 'tests/int/elements-wave49.int.spec.ts')
const SOURCES = [RENDERER, CLIENT, CSS_PATH, DEFS, SPEC]

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

/** Stubs matchMedia so the reduced-motion query matches (or not) for the duration of one test. */
function stubReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

afterEach(() => {
  cleanup()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).matchMedia
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.style.overflow = ''
})

describe('wave 49 registry', () => {
  it('defines gallery once, in media, visible in the library', () => {
    expect(WAVE49_ELEMENTS.map((e) => e.type)).toEqual(['gallery'])
    expect(cats.has(WAVE49_ELEMENTS[0]!.category)).toBe(true)
    expect(WAVE49_ELEMENTS[0]!.category).toBe('media')
    expect(WAVE49_ELEMENTS[0]!.hidden).not.toBe(true)
    expect(WAVE49_COMPONENTS.gallery).toBeDefined()
  })

  it('hides the three picture widgets from the library but keeps their renderers', () => {
    for (const t of OLD_PICTURES) {
      expect(getElementDef(t)?.hidden, t).toBe(true)
      expect(ELEMENT_COMPONENTS[t], t).toBeDefined()
    }
    expect(render({})).toContain('el-placeholder')
    expect(renderToStaticMarkup(renderElement('image-gallery', { urls: URLS }) as React.ReactElement)).toContain('el-gallery')
    expect(renderToStaticMarkup(renderElement('logo-strip', { images: [] }) as React.ReactElement)).toContain('Add logos')
  })

  it('default props only use declared fields, with matching value kinds', () => {
    for (const e of WAVE49_ELEMENTS) {
      const props = e.defaultProps()
      for (const [k, v] of Object.entries(props)) {
        const field = e.fields.find((f) => f.name === k)
        expect(field, `${e.type}.${k}`).toBeDefined()
        if (field!.type === 'range') expect(typeof v, `${e.type}.${k}`).toBe('number')
        if (field!.type === 'text' || field!.type === 'textarea') expect(typeof v, `${e.type}.${k}`).toBe('string')
        if (field!.type === 'checkbox') expect(typeof v, `${e.type}.${k}`).toBe('boolean')
        if (field!.type === 'select') expect(field!.options!.map((o) => o.value), `${e.type}.${k}`).toContain(v)
      }
      const names = e.fields.map((f) => f.name)
      expect(new Set(names).size, e.type).toBe(names.length)
    }
  })

  it('exposes the layout, lightbox and carousel options', () => {
    const fields = Object.fromEntries(WAVE49_ELEMENTS[0]!.fields.map((f) => [f.name, f]))
    expect(fields.layout!.options!.map((o) => o.value)).toEqual(['grid', 'masonry', 'carousel', 'logos'])
    expect(fields.images!.type).toBe('mediaMulti')
    expect(fields.lightbox!.type).toBe('checkbox')
    expect(fields.autoplay!.showIf).toEqual({ field: 'layout', equals: 'carousel' })
    expect(fields.fit!.options!.map((o) => o.value)).toEqual(['cover', 'contain'])
  })

  it('renders with its defaults and survives empty props', () => {
    expect(() => render(WAVE49_ELEMENTS[0]!.defaultProps())).not.toThrow()
    expect(() => render({})).not.toThrow()
  })
})

describe('gallery markup', () => {
  it('shows a hint when there are no pictures, and drops unsafe addresses', () => {
    expect(render({})).toContain('Add pictures to the gallery')
    expect(render({ urls: 'javascript:alert(1) | bad' })).toContain('Add pictures to the gallery')
    expect(render({ urls: 'javascript:alert(1) | bad' })).not.toContain('javascript')
  })

  it('grid by default: a list of links to full pictures, with columns and gap set', () => {
    const html = render({ ...WAVE49_ELEMENTS[0]!.defaultProps(), ...THREE })
    expect(html).toContain('class="be-el-49-gallery be-el-49-gallery--grid"')
    expect(html.match(/<li>/g)).toHaveLength(3)
    expect(html).toContain('href="https://cdn.example.com/a.jpg"')
    expect(html).toContain('data-be-gallery-index="2"')
    expect(html).toContain('--be-el-49-cols:3')
    expect(html).toContain('--be-el-49-gap:12px')
    expect(html).toContain('aspect-ratio:1 / 1')
    expect(html).not.toContain('be-el-49-gallery--grey')
  })

  it('without the lightbox, pictures are plain images with no links', () => {
    const html = render({ ...THREE, lightbox: false })
    expect(html).toContain('<img')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('data-be-gallery-index')
  })

  it('clamps columns and gap, and falls back for unknown layouts', () => {
    const html = render({ ...THREE, columns: 99, gap: -5, layout: 'mosaic' })
    expect(html).toContain('--be-el-49-cols:6')
    expect(html).toContain('--be-el-49-gap:0px')
    expect(html).toContain('be-el-49-gallery--grid')
  })

  it('fit contain sets object-fit, and auto shape leaves the picture alone', () => {
    expect(render({ ...THREE, fit: 'contain' })).toContain('object-fit:contain')
    expect(render({ ...THREE, ratio: 'auto' })).not.toContain('aspect-ratio')
    expect(render({ ...THREE, ratio: '4:3' })).toContain('aspect-ratio:4 / 3')
  })

  it('masonry keeps each picture at its own shape', () => {
    const html = render({ ...THREE, layout: 'masonry', ratio: '1:1' })
    expect(html).toContain('be-el-49-gallery--masonry')
    expect(html).not.toContain('aspect-ratio')
  })

  it('shows alt text as captions only when asked', () => {
    expect(render({ ...THREE })).not.toContain('<figcaption')
    const html = render({ ...THREE, captions: true })
    expect(html).toContain('<figcaption>First picture</figcaption>')
  })

  it('escapes alt text and captions', () => {
    const html = render({ urls: 'https://cdn.example.com/x.jpg | <b>bold</b>', captions: true })
    expect(html).not.toContain('<b>bold')
    expect(html).toContain('&lt;b&gt;bold')
  })
})

describe('logo strip', () => {
  it('is greyscale by default, with no lightbox links even when the lightbox is on', () => {
    const html = render({ ...THREE, layout: 'logos', lightbox: true })
    expect(html).toContain('be-el-49-gallery--logos')
    expect(html).toContain('be-el-49-gallery--grey')
    expect(html).not.toContain('<a ')
  })

  it('greyscale off removes the grey class, and on keeps it for any layout', () => {
    expect(render({ ...THREE, layout: 'logos', grayscale: 'off' })).not.toContain('be-el-49-gallery--grey')
    expect(render({ ...THREE, layout: 'grid', grayscale: 'on' })).toContain('be-el-49-gallery--grey')
    expect(render({ ...THREE, layout: 'grid', grayscale: 'auto' })).not.toContain('be-el-49-gallery--grey')
  })
})

describe('carousel markup', () => {
  it('is a labelled scrollable region of slides, with a slide count on each', () => {
    const html = render({ ...THREE, layout: 'carousel', label: 'Summer' })
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Summer"')
    expect(html.match(/be-el-49-car__slide/g)).toHaveLength(3)
    expect(html).toContain('aria-label="2 of 3"')
    expect(html).toContain('aria-label="Previous pictures"')
    expect(html).toContain('aria-label="Next pictures"')
    expect(html).toContain('aspect-ratio:4 / 3')
  })

  it('shows no autoplay control unless autoplay is on', () => {
    expect(render({ ...THREE, layout: 'carousel', autoplay: false })).not.toContain('slideshow')
    expect(render({ ...THREE, layout: 'carousel', autoplay: true })).toContain('Pause slideshow')
  })

  it('uses the default label when none is given', () => {
    expect(render({ ...THREE, layout: 'carousel', label: '  ' })).toContain('aria-label="Image gallery"')
  })
})

describe('gallery behaviour (client)', () => {
  it('opens the lightbox on a plain click, showing that picture', () => {
    stubReducedMotion(false)
    mount({ ...THREE })
    const links = screen.getAllByRole('link')
    fireEvent.click(links[1]!)
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/b.jpg')
    expect(screen.getByText('Picture 2 of 3')).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('leaves modified clicks alone so new-tab opening still works', () => {
    mount({ ...THREE })
    fireEvent.click(screen.getAllByRole('link')[0]!, { ctrlKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('moves between pictures with the arrow keys, wrapping at the ends', () => {
    mount({ ...THREE })
    fireEvent.click(screen.getAllByRole('link')[2]!)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'ArrowRight' })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/a.jpg')
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' })
    expect(dialog.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/c.jpg')
  })

  it('closes on Escape, returns focus to the picture link and unlocks scroll', () => {
    mount({ ...THREE })
    const link = screen.getAllByRole('link')[0]!
    link.focus()
    fireEvent.click(link)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(link)
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps Tab focus inside the dialog, wrapping from the last control to the first', () => {
    mount({ ...THREE })
    fireEvent.click(screen.getAllByRole('link')[0]!)
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Close' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous picture' }))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(close)
  })

  it('the close button closes the dialog', () => {
    mount({ ...THREE })
    fireEvent.click(screen.getAllByRole('link')[0]!)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('carousel autoplay advances after the interval and can be paused', () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
    const scrollTo = vi.fn()
    const original = Element.prototype.scrollTo
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
    mount({ ...THREE, layout: 'carousel', autoplay: true })
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(scrollTo).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }))
    expect(screen.getByRole('button', { name: 'Play slideshow' })).toBeTruthy()
    scrollTo.mockClear()
    act(() => {
      vi.advanceTimersByTime(12000)
    })
    expect(scrollTo).not.toHaveBeenCalled()
    Element.prototype.scrollTo = original
  })

  it('reduced motion turns autoplay off and hides its control', () => {
    stubReducedMotion(true)
    mount({ ...THREE, layout: 'carousel', autoplay: true })
    expect(screen.queryByRole('button', { name: /slideshow/ })).toBeNull()
    expect(screen.getByRole('region')).toBeTruthy()
  })
})

describe('gallery styles', () => {
  const CSS = fs.readFileSync(CSS_PATH, 'utf8')

  it('guards every animation, transition and transform with prefers-reduced-motion: no-preference', () => {
    expect(unguardedMotion(CSS)).toEqual([])
    expect(unguardedTransforms(CSS)).toEqual([])
  })

  it('keeps the checker honest: an unguarded transition is caught', () => {
    expect(unguardedMotion('.a { transition: opacity 1s; }')).toHaveLength(1)
    expect(unguardedMotion('@media (prefers-reduced-motion: no-preference) { .a { transition: opacity 1s; } }')).toEqual([])
  })

  it('scopes every selector with .be-el-49-', () => {
    const selectors = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((s) => s.split('}').pop()!.trim())
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('@'))
    expect(selectors.length).toBeGreaterThan(0)
    for (const sel of selectors) expect(sel.startsWith('.be-el-49-'), sel).toBe(true)
  })

  it('reflows the grid and masonry to at most two columns under 640px', () => {
    expect(CSS).toContain('@media (max-width: 639.98px)')
    expect(CSS).toContain('min(var(--be-el-49-cols, 3), 2)')
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
