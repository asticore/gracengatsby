import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findSuggestions = vi.fn()
vi.mock('@/features/search/suggest', () => ({
  SUGGEST_MIN_CHARS: 2,
  normalizeSuggestQuery: (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 80) : ''),
  findSuggestions: (...a: unknown[]): unknown => findSuggestions(...a),
}))
vi.mock('@/features/security/rateLimit', () => ({
  clientKey: () => 'k',
  hit: vi.fn(() => ({ limited: false, count: 1, limit: 60, retryAfterSeconds: 0 })),
}))

import { GET } from '@/app/(engage)/api/search-suggest/route'
import { hit } from '@/features/security/rateLimit'
import { enterTarget, navReduce, parseSuggestions } from '@/components/blocks/elements/searchSuggestLogic'
import SearchSuggest from '@/components/blocks/elements/SearchSuggest'
import { SearchBoxElement } from '@/components/blocks/elements/Wave38Elements'
import { WAVE38_ELEMENTS } from '@/lib/elements/wave38Defs'

const req = (q: string) => new Request(`http://x.test/api/search-suggest?q=${encodeURIComponent(q)}`)

describe('GET /api/search-suggest', () => {
  beforeEach(() => findSuggestions.mockReset())

  it('returns [] for short queries without searching', async () => {
    const res = await GET(req('a'))
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([])
    expect(findSuggestions).not.toHaveBeenCalled()
  })

  it('returns results with a short public cache header', async () => {
    findSuggestions.mockResolvedValue([{ title: 'Hello', url: '/blog/hello', type: 'Post', excerpt: 'x' }])
    const res = await GET(req('hel'))
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=30')
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(1)
  })

  it('honours the rate limit', async () => {
    vi.mocked(hit).mockReturnValueOnce({ limited: true, count: 61, limit: 60, retryAfterSeconds: 5 })
    const limited = await GET(req('hello'))
    expect(limited.status).toBe(429)
  })
})

describe('suggestion keyboard logic', () => {
  const items = [1, 2, 3].map((n) => ({ title: `t${n}`, url: `/p${n}`, type: 'Page', excerpt: '' }))
  it('moves and wraps through the list', () => {
    let s = navReduce({ open: true, active: -1 }, { type: 'down' }, 3)
    expect(s.active).toBe(0)
    s = navReduce({ open: true, active: 2 }, { type: 'down' }, 3)
    expect(s.active).toBe(-1)
    expect(navReduce({ open: true, active: -1 }, { type: 'up' }, 3).active).toBe(2)
    expect(navReduce({ open: false, active: -1 }, { type: 'down' }, 3)).toEqual({ open: true, active: 0 })
  })
  it('escape closes, enter navigates only to a highlighted option', () => {
    expect(navReduce({ open: true, active: 1 }, { type: 'escape' }, 3)).toEqual({ open: false, active: -1 })
    expect(enterTarget({ open: true, active: 1 }, items)).toBe('/p2')
    expect(enterTarget({ open: true, active: -1 }, items)).toBeNull()
    expect(enterTarget({ open: false, active: 1 }, items)).toBeNull()
  })
})

describe('escaping and parsing', () => {
  it('keeps markup as text and drops off-site urls', () => {
    const out = parseSuggestions({ results: [
      { title: '<img src=x onerror=1>', url: '/a', type: 'Page', excerpt: '<b>x</b>' },
      { title: 'evil', url: 'https://evil.test', type: 'Page', excerpt: '' },
      { title: 'evil2', url: '//evil.test', type: 'Page', excerpt: '' },
    ] })
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('<img src=x onerror=1>')
  })
  it('handles garbage', () => {
    expect(parseSuggestions(null)).toEqual([])
    expect(parseSuggestions({ results: 'no' })).toEqual([])
  })
})

describe('search-box element', () => {
  it('server-renders a working GET form (no JS needed)', () => {
    const html = renderToStaticMarkup(React.createElement(SearchBoxElement, { liveResults: true }))
    expect(html).toContain('action="/search"')
    expect(html).toContain('method="get"')
    expect(html).toContain('name="q"')
    expect(html).toContain('role="combobox"')
  })
  it('plain form when liveResults is off', () => {
    const html = renderToStaticMarkup(React.createElement(SearchBoxElement, { liveResults: false }))
    expect(html).toContain('action="/search"')
    expect(html).not.toContain('combobox')
  })
  it('component renders collapsed listbox', () => {
    const html = renderToStaticMarkup(React.createElement(SearchSuggest, { placeholder: 'Search', button: 'Go', maxResults: 6, showType: true }))
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('role="listbox"')
  })
  it('def declares the new options', () => {
    const def = WAVE38_ELEMENTS.find((e) => e.type === 'search-box')!
    const names = def.fields.map((f) => f.name)
    expect(names).toEqual(expect.arrayContaining(['placeholder', 'liveResults', 'maxResults', 'showType']))
  })
})
