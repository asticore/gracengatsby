// @vitest-environment node
// Page addresses per domain: the same path can be a shared page and a site-specific one, each domain sees its own, and a page
// whose parent is on another domain has no address there.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const state = vi.hoisted(() => ({
  host: 'example.com' as string | null,
  docs: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    find: async () => ({ docs: state.docs }),
  }),
}))
vi.mock('@/features/domains/request', () => ({ requestHost: async () => state.host }))

import { getAllResolvedPages, getHomepage } from '@/utilities/pagePaths'

const doc = (id: number, slug: string, availableDomains: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  slug,
  title: slug,
  _status: 'published',
  availableDomains,
  parent: null as unknown,
  isHomepage: false,
  ...extra,
})

const addresses = async () => (await getAllResolvedPages()).map((entry) => entry.path.join('/')).sort()

describe('page addresses per domain', () => {
  beforeEach(() => {
    state.host = 'example.com'
    state.docs = []
  })

  it('one document per address: the domain-specific page wins over the shared one', async () => {
    state.docs = [doc(1, 'about', null), doc(2, 'about', ',example.com,')]
    const entries = await getAllResolvedPages()
    expect(entries).toHaveLength(1)
    expect(entries[0].page.id).toBe(2)
  })

  it('a page scoped to another domain is not served here, the shared one is', async () => {
    state.docs = [doc(1, 'about', null), doc(2, 'about', ',example.com.au,')]
    expect((await getAllResolvedPages()).map((e) => e.page.id)).toEqual([1])
    state.host = 'example.com.au'
    expect((await getAllResolvedPages()).map((e) => e.page.id)).toEqual([2])
  })

  it('a child of a page scoped to another domain has no address on this domain', async () => {
    state.docs = [
      doc(1, 'services', ',example.com.au,'),
      doc(2, 'consulting', null, { parent: 1 }),
      doc(3, 'contact', null),
    ]
    expect(await addresses()).toEqual(['contact'])
    state.host = 'example.com.au'
    expect(await addresses()).toEqual(['contact', 'services', 'services/consulting'])
  })

  it('with no registered host nothing is narrowed', async () => {
    state.host = null
    state.docs = [doc(1, 'about', ',example.com.au,'), doc(2, 'contact', null)]
    expect(await addresses()).toEqual(['about', 'contact'])
  })

  it('the homepage is this domain\'s own when it has one, else the shared one, never another domain\'s', async () => {
    state.docs = [
      doc(1, 'home', null, { isHomepage: true }),
      doc(2, 'home-au', ',example.com.au,', { isHomepage: true }),
    ]
    expect((await getHomepage())?.id).toBe(1)
    state.host = 'example.com.au'
    expect((await getHomepage())?.id).toBe(2)
    state.docs = [doc(2, 'home-au', ',example.com.au,', { isHomepage: true })]
    state.host = 'example.com'
    expect(await getHomepage()).toBeNull()
  })
})
