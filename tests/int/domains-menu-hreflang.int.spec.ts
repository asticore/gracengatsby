// @vitest-environment node
// Menus resolve a page id per domain, and page hreflang leaves out a domain that serves its own version of the address.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  anyPages: [] as Array<Record<string, unknown>>,
  posts: [] as unknown[],
}))

vi.mock('@/utilities/pagePaths', () => ({
  getAllResolvedPagesAnyDomain: async () => state.anyPages,
}))
vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({ find: async () => ({ docs: state.posts }) }),
}))

import { menuPageEntry, type MenuPageEntry } from '@/features/domains/menu'
import { domainOverridesAt, overriddenHosts } from '@/features/domains/served'

type Entry = MenuPageEntry & { page: { id: number; availableDomains: string | null } }
const entry = (id: number, path: string, availableDomains: string | null): Entry => ({
  page: { id, availableDomains },
  path: [path],
})

describe('menuPageEntry (a menu link to a page scoped to another domain)', () => {
  const shared = entry(1, 'about', null)
  const au = entry(2, 'about', ',example.com.au,')
  const contact = entry(3, 'contact', ',example.com,')
  const anyDomain = [shared, au, contact]

  it('uses the page itself when this domain serves it', () => {
    expect(menuPageEntry(1, 'example.com', [shared], anyDomain)).toBe(shared)
    expect(menuPageEntry(3, 'example.com', [contact], anyDomain)).toBe(contact)
  })

  it('points to this domain\'s own page at the same address when the linked page is scoped elsewhere', () => {
    // On example.com.au the shared /about is overridden by au's own /about, which the page list holds.
    expect(menuPageEntry(1, 'example.com.au', [au], anyDomain)).toBe(au)
  })

  it('hides the link when the linked page is scoped to another domain and there is no own page at that address', () => {
    expect(menuPageEntry(3, 'example.com.au', [], anyDomain)).toBeNull()
    expect(menuPageEntry(2, 'example.com', [shared], anyDomain)).toBeNull()
  })

  it('does not stand in a shared page for a link to a page scoped elsewhere', () => {
    expect(menuPageEntry(2, 'example.com', [shared], anyDomain)).toBeNull()
  })

  it('narrows nothing without a registered host, and drops unknown ids', () => {
    expect(menuPageEntry(2, null, [], anyDomain)).toBe(au)
    expect(menuPageEntry(99, 'example.com', [shared], anyDomain)).toBeNull()
  })
})

describe('overriddenHosts', () => {
  it('collects every host that a document is scoped to at an address', () => {
    expect([...overriddenHosts([null, ',example.com.au,', ',example.com,example.co.uk,'])].sort()).toEqual(['example.co.uk', 'example.com', 'example.com.au'])
    expect(overriddenHosts([null, ''])).toEqual(new Set())
  })
})

describe('domainOverridesAt (which domains serve their own version of an address)', () => {
  beforeEach(() => {
    state.anyPages = []
    state.posts = []
  })

  it('reports the domain of a page scoped to it at the same path', async () => {
    state.anyPages = [
      { page: { id: 1, availableDomains: null }, path: ['about'] },
      { page: { id: 2, availableDomains: ',example.com.au,' }, path: ['about'] },
    ]
    expect([...(await domainOverridesAt('/about'))]).toEqual(['example.com.au'])
    expect([...(await domainOverridesAt('/contact'))]).toEqual([])
  })

  it('looks blog posts and shop products up by slug', async () => {
    state.posts = [{ availableDomains: ',example.com.au,' }]
    expect([...(await domainOverridesAt('/blog/news'))]).toEqual(['example.com.au'])
    expect([...(await domainOverridesAt('/shop/mug'))]).toEqual(['example.com.au'])
  })
})
