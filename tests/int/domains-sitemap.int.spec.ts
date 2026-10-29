// @vitest-environment node
// The sitemap for one domain: a domain-specific document wins over the shared one at the same address, a shared
// document is not listed on a domain that serves its own version there, and hreflang only links the same document.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  host: 'example.com' as string | null,
  domains: [] as unknown[],
  pages: [] as unknown[],
  posts: [] as unknown[],
  home: null as unknown,
}))

vi.mock('@/lib/engine', () => ({
  getEngine: async () => ({
    findGlobal: async (): Promise<null> => null,
    find: async ({ collection }: { collection: string }): Promise<{ docs: unknown[] }> => ({ docs: collection === 'posts' ? state.posts : [] }),
  }),
}))
vi.mock('@/utilities/pagePaths', () => ({
  getAllResolvedPages: async () => state.pages,
  getHomepage: async () => state.home,
}))
vi.mock('@/features/domains/request', () => ({
  requestDomain: async (): Promise<{ host: string; status: string } | null> => (state.host ? { host: state.host, status: 'active' } : null),
}))
vi.mock('@/features/domains/store', () => ({ readDomainsFromD1: async () => state.domains }))
vi.mock('@/features/seo/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/seo/settings')>()),
  getSeoContext: async (): Promise<{ enabled: boolean; baseUrl: string; settings: object }> => ({ enabled: true, baseUrl: 'https://example.com', settings: {} }),
}))
vi.mock('@/features/multilingual/settings', () => ({
  readMultilingualSettingsFromD1: async () => ({ enabled: false, defaultLocale: 'en', locales: ['en'] }),
}))
vi.mock('@/features/multilingual/routing', () => ({ isLocaleRoutable: () => false }))
vi.mock('@/features/multilingual/store', () => ({ findTranslations: async (): Promise<unknown[]> => [] }))
vi.mock('@/features/multilingual/availability', () => ({
  nonDefaultLocales: (): string[] => [],
  publishIndex: (): Record<string, never> => ({}),
  publishableLocalesForDocument: (): null => null,
}))
vi.mock('@/features/visibility/excludeProtected', () => ({ excludeProtected: async (_c: string, docs: unknown[]) => docs }))
vi.mock('@/features/seo/indexable', () => ({ isNoIndexedPage: () => false, readPasswordGate: async () => false }))
vi.mock('@/features/security/settings', () => ({ getAdminRoot: async () => '/admin' }))
vi.mock('@/features/blog/switches', () => ({ loadBlogSwitches: async () => ({ tags: false, authorArchives: false }) }))
vi.mock('@/utilities/features', () => ({ getFeatureFlags: async () => ({ blog: true, ecommerce: false, events: false, faq: false }) }))

import { buildSitemapEntries } from '@/features/seo/sitemap'

const domain = (host: string, defaultLocale: string | null = null): Record<string, unknown> => ({
  host,
  label: host,
  status: 'active',
  isPrimary: host === 'example.com',
  defaultLocale,
  overrides: {},
})

/** A resolved page as getAllResolvedPages returns it: the document, its path and its ancestors. */
const resolved = (id: number, slug: string, availableDomains: string | null): Record<string, unknown> => ({
  page: { id, slug, title: slug, availableDomains, updatedAt: '2026-10-01' },
  path: [slug],
  ancestors: [] as unknown[],
})

const pathsOf = (entries: { url: string }[]): string[] => entries.map((e) => new URL(e.url).pathname).sort()

describe('sitemap with site-specific documents', () => {
  beforeEach(() => {
    state.host = 'example.com'
    state.domains = [domain('example.com'), domain('example.com.au', 'en')]
    state.home = null
    state.pages = []
    state.posts = []
  })

  it('lists the domain-specific version once and the shared version only where it is the one served', async () => {
    state.pages = [resolved(1, 'about', null)]
    const entries = (await buildSitemapEntries()) ?? []
    expect(pathsOf(entries)).toContain('/about')
    // The shared page has no override here, so its hreflang lists the second domain.
    const about = entries.find((e) => new URL(e.url).pathname === '/about')
    expect(about?.alternates?.some((a) => a.href === 'https://example.com.au/about')).toBe(true)
  })

  it('does not list a shared page as an alternate of a domain that serves its own version of the address', async () => {
    state.posts = [
      { id: 5, slug: 'news', _status: 'published', availableDomains: null, updatedAt: '2026-10-01' },
      { id: 6, slug: 'news', _status: 'published', availableDomains: ',example.com,', updatedAt: '2026-10-02' },
    ]
    state.host = 'example.com'
    const entries = (await buildSitemapEntries()) ?? []
    const news = entries.filter((e) => new URL(e.url).pathname === '/blog/news')
    expect(news).toHaveLength(1)
    expect(news[0].lastModified).toBe(new Date('2026-10-02').toISOString())
  })

  it('omits the shared version of an address on a domain that has its own version of it', async () => {
    state.host = 'example.com.au'
    state.pages = [resolved(2, 'about', ',example.com.au,')]
    state.posts = [
      { id: 7, slug: 'news', _status: 'published', availableDomains: null, updatedAt: '2026-10-01' },
      { id: 8, slug: 'news', _status: 'published', availableDomains: ',example.com.au,', updatedAt: '2026-10-03' },
    ]
    const entries = (await buildSitemapEntries()) ?? []
    const news = entries.filter((e) => new URL(e.url).pathname === '/blog/news')
    expect(news).toHaveLength(1)
    expect(news[0].lastModified).toBe(new Date('2026-10-03').toISOString())
    // A site-specific page links to no other domain: its address there is a different document.
    const about = entries.find((e) => new URL(e.url).pathname === '/about')
    expect(about?.alternates ?? []).toEqual([])
  })
})
