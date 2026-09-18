// src/localapi/queryParser.ts has zero dependency on @/engine, @/engage.config,
// or the database - it's pure functions over URLSearchParams, so (per the
// same reasoning as localapi-validators.int.spec.ts) the default jsdom
// environment this repo's vitest.config.mts runs under is enough, and this
// lives in tests/int since that's the only glob vitest.config.mts picks up.
import { describe, expect, it } from 'vitest'

import { parseSearchParams } from '@/localapi/queryParser'

function qs(raw: string) {
  return new URLSearchParams(raw)
}

describe('localapi/queryParser - where operators', () => {
  const cases: Array<[string, string, unknown]> = [
    ['equals', 'where[title][equals]=hello', 'hello'],
    ['not_equals', 'where[title][not_equals]=hello', 'hello'],
    ['exists', 'where[title][exists]=true', true],
    ['contains', 'where[title][contains]=ell', 'ell'],
    ['like', 'where[title][like]=ell', 'ell'],
    ['not_like', 'where[title][not_like]=ell', 'ell'],
    ['greater_than', 'where[age][greater_than]=5', 5],
    ['greater_than_equal', 'where[age][greater_than_equal]=5', 5],
    ['less_than', 'where[age][less_than]=5', 5],
    ['less_than_equal', 'where[age][less_than_equal]=5', 5],
  ]

  it.each(cases)('parses where[field][%s]', (operator, query, expected) => {
    const result = parseSearchParams(qs(query))
    const field = query.includes('title') ? 'title' : 'age'
    expect(result.where).toEqual({ [field]: { [operator]: expected } })
  })

  it('parses exists=false as boolean false', () => {
    const result = parseSearchParams(qs('where[title][exists]=false'))
    expect(result.where).toEqual({ title: { exists: false } })
  })

  it('parses in as a comma-split array of coerced scalars', () => {
    const result = parseSearchParams(qs('where[status][in]=draft,published,2'))
    expect(result.where).toEqual({ status: { in: ['draft', 'published', 2] } })
  })

  it('parses not_in as a comma-split array', () => {
    const result = parseSearchParams(qs('where[status][not_in]=draft,published'))
    expect(result.where).toEqual({ status: { not_in: ['draft', 'published'] } })
  })

  it('parses in given as bracket-indexed values', () => {
    const result = parseSearchParams(qs('where[status][in][0]=draft&where[status][in][1]=published'))
    expect(result.where).toEqual({ status: { in: ['draft', 'published'] } })
  })

  it('coerces numeric-looking and boolean-looking scalar values', () => {
    const result = parseSearchParams(qs('where[count][equals]=42&where[active][equals]=true'))
    expect(result.where).toEqual({ count: { equals: 42 }, active: { equals: true } })
  })

  it('supports multiple operators on the same field', () => {
    const result = parseSearchParams(qs('where[age][greater_than]=5&where[age][less_than]=10'))
    expect(result.where).toEqual({ age: { greater_than: 5, less_than: 10 } })
  })
})

describe('localapi/queryParser - and/or composition', () => {
  it('parses where[or][n][field][operator]', () => {
    const result = parseSearchParams(qs('where[or][0][title][equals]=a&where[or][1][title][equals]=b'))
    expect(result.where).toEqual({
      or: [{ title: { equals: 'a' } }, { title: { equals: 'b' } }],
    })
  })

  it('parses where[and][n][field][operator]', () => {
    const result = parseSearchParams(qs('where[and][0][title][equals]=a&where[and][1][age][greater_than]=5'))
    expect(result.where).toEqual({
      and: [{ title: { equals: 'a' } }, { age: { greater_than: 5 } }],
    })
  })

  it('supports nested or-inside-and composition', () => {
    const result = parseSearchParams(
      qs('where[and][0][or][0][title][equals]=a&where[and][0][or][1][title][equals]=b&where[and][1][age][greater_than]=5'),
    )
    expect(result.where).toEqual({
      and: [{ or: [{ title: { equals: 'a' } }, { title: { equals: 'b' } }] }, { age: { greater_than: 5 } }],
    })
  })
})

describe('localapi/queryParser - sort', () => {
  it('parses a single-field sort as a plain string', () => {
    expect(parseSearchParams(qs('sort=-createdAt')).sort).toBe('-createdAt')
  })

  it('parses a comma-joined multi-field sort as an array', () => {
    expect(parseSearchParams(qs('sort=title,-createdAt')).sort).toEqual(['title', '-createdAt'])
  })

  it('omits sort when absent', () => {
    expect(parseSearchParams(qs('')).sort).toBeUndefined()
  })
})

describe('localapi/queryParser - integer params', () => {
  it('coerces limit, page, and depth to numbers', () => {
    const result = parseSearchParams(qs('limit=10&page=2&depth=3'))
    expect(result.limit).toBe(10)
    expect(result.page).toBe(2)
    expect(result.depth).toBe(3)
  })

  it('omits an integer param when missing or non-numeric', () => {
    expect(parseSearchParams(qs('limit=notanumber')).limit).toBeUndefined()
    expect(parseSearchParams(qs('')).page).toBeUndefined()
  })
})

describe('localapi/queryParser - boolean params', () => {
  it('treats pagination=false as boolean false', () => {
    expect(parseSearchParams(qs('pagination=false')).pagination).toBe(false)
  })

  it('treats any other non-empty pagination value as true', () => {
    expect(parseSearchParams(qs('pagination=true')).pagination).toBe(true)
    expect(parseSearchParams(qs('pagination=1')).pagination).toBe(true)
  })

  it('treats draft=false as boolean false and draft=true as true', () => {
    expect(parseSearchParams(qs('draft=false')).draft).toBe(false)
    expect(parseSearchParams(qs('draft=true')).draft).toBe(true)
  })

  it('omits boolean params when absent', () => {
    const result = parseSearchParams(qs(''))
    expect(result.pagination).toBeUndefined()
    expect(result.draft).toBeUndefined()
  })
})

describe('localapi/queryParser - malformed input resilience', () => {
  it('never throws on an empty query string', () => {
    expect(() => parseSearchParams(qs(''))).not.toThrow()
    expect(parseSearchParams(qs(''))).toEqual({})
  })

  it('ignores a where value that is a bare scalar rather than an operator object', () => {
    expect(() => parseSearchParams(qs('where[title]=hello'))).not.toThrow()
    expect(parseSearchParams(qs('where[title]=hello')).where).toBeUndefined()
  })

  it('ignores an or/and value that is not an array', () => {
    expect(() => parseSearchParams(qs('where[or][field][equals]=x'))).not.toThrow()
    expect(parseSearchParams(qs('where[or][field][equals]=x')).where).toBeUndefined()
  })

  it('ignores unrecognized top-level params', () => {
    const result = parseSearchParams(qs('bogus=1&anotherOne[nested]=2'))
    expect(result).toEqual({})
  })

  it('handles a where clause with no recognized leaves gracefully', () => {
    expect(() => parseSearchParams(qs('where[title]'))).not.toThrow()
  })

  it('handles duplicate keys by keeping the last-parsed value', () => {
    const result = parseSearchParams(qs('limit=1&limit=2'))
    expect(result.limit).toBe(2)
  })
})
