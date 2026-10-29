// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { availableOnHost, parseHostList } from '@/features/domains/scope'
import { availableDomainsField } from '@/features/domains/field'

describe('parseHostList', () => {
  it('splits, normalises and de-duplicates, dropping invalid entries', () => {
    expect(parseHostList('Example.com, example.com.au ;https://Example.com/x  not a host')).toEqual(['example.com', 'example.com.au'])
    expect(parseHostList(null)).toEqual([])
  })
})

describe('availableOnHost', () => {
  it('empty list means every domain', () => {
    expect(availableOnHost('', 'example.com')).toBe(true)
    expect(availableOnHost(null, 'example.co.uk')).toBe(true)
  })

  it('a listed domain shows the content and others do not', () => {
    expect(availableOnHost('example.com.au', 'example.com.au')).toBe(true)
    expect(availableOnHost('example.com.au', 'example.com')).toBe(false)
  })

  it('a request that is not on a registered domain is never narrowed', () => {
    expect(availableOnHost('example.com.au', null)).toBe(true)
    expect(availableOnHost('example.com.au', undefined)).toBe(true)
  })
})

describe('availableDomains field hook', () => {
  const hook = (availableDomainsField.hooks as unknown as { beforeChange: Array<(args: { value?: unknown }) => unknown> }).beforeChange[0]

  it('stores a normalised comma list, or null when empty', () => {
    expect(hook({ value: ' Example.com ,example.com.au' })).toBe(',example.com,example.com.au,')
    expect(hook({ value: '   ' })).toBeNull()
  })

  it('refuses an entry that is not a host name', () => {
    expect(() => hook({ value: 'example.com, *.bad' })).toThrow(/Available on domains/)
  })
})
