import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Metadata } from 'next'
import { buildMetadata } from '@/utilities/seo'
import type { SeoContext } from '@/features/seo/settings'

// Mock the engine
vi.mock('@/lib/engine', () => ({
  getEngine: vi.fn(),
}))

// Mock getSeoContext
vi.mock('@/features/seo/settings', async (orig) => {
  const module = await orig() as any
  return {
    ...module,
    getSeoContext: vi.fn(),
  }
})

import { getEngine } from '@/lib/engine'
import { getSeoContext } from '@/features/seo/settings'

const mockGetEngine = vi.mocked(getEngine)
const mockGetSeoContext = vi.mocked(getSeoContext)

const siteSettingsStub = {
  seo: {
    titleTemplate: '%s | Example',
    defaultDescription: 'Site description',
    siteIndexable: true,
  },
}

describe('buildMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Feature DISABLED (context.enabled=false)', () => {
    beforeEach(() => {
      mockGetSeoContext.mockResolvedValue({
        enabled: false,
        settings: null,
        siteName: 'Example',
        baseUrl: 'https://example.com',
      })
      mockGetEngine.mockResolvedValue({
        findGlobal: vi.fn().mockResolvedValue(siteSettingsStub),
      } as any)
    })

    it('(1) seo.metaTitle with title gives title templated by site settings', async () => {
      const result = await buildMetadata({
        title: 'Page',
        seo: { metaTitle: 'Custom Meta' },
      })
      expect(result.title).toBe('Custom Meta | Example')
    })

    it('(2) no metaTitle gives title templated by site settings', async () => {
      const result = await buildMetadata({
        title: 'Page',
      })
      expect(result.title).toBe('Page | Example')
    })

    it('(3) no canonical and no openGraph.url when path given', async () => {
      const result = await buildMetadata({
        title: 'Page',
        path: '/about',
      })
      expect(result.alternates?.canonical).toBeUndefined()
      expect(result.openGraph?.url).toBeUndefined()
    })

    it('(4) description falls back to site default', async () => {
      const result = await buildMetadata({
        title: 'Page',
      })
      expect(result.description).toBe('Site description')
    })
  })

  describe('Feature ENABLED', () => {
    beforeEach(() => {
      mockGetSeoContext.mockResolvedValue({
        enabled: true,
        settings: {
          defaults: {
            titleTemplate: null,
            metaDescription: null,
            defaultOgImage: null,
            twitterHandle: null,
          },
          indexing: {
            allowIndexing: true,
            noindexPaths: '',
          },
        },
        siteName: 'Example',
        baseUrl: 'https://example.com',
      } as any)
      mockGetEngine.mockResolvedValue({
        findGlobal: vi.fn().mockResolvedValue(siteSettingsStub),
      } as any)
    })

    it('(5) with path /about and no custom canonical: alternates.canonical and openGraph.url set, siteName set, metadataBase set', async () => {
      const result = await buildMetadata({
        title: 'About',
        path: '/about',
      })
      expect(result.alternates?.canonical).toBe('https://example.com/about')
      expect(result.openGraph?.url).toBe('https://example.com/about')
      expect(result.openGraph?.siteName).toBe('Example')
      expect(result.metadataBase).toEqual(new URL('https://example.com'))
    })

    it('(6) no path: no alternates, no openGraph.url', async () => {
      const result = await buildMetadata({
        title: 'Page',
      })
      expect(result.alternates).toBeUndefined()
      expect(result.openGraph?.url).toBeUndefined()
    })

    it('(7) seo.canonicalUrl wins over path canonical', async () => {
      const result = await buildMetadata({
        title: 'Page',
        path: '/about',
        seo: { canonicalUrl: 'https://other.com/x' },
      })
      expect(result.alternates?.canonical).toBe('https://other.com/x')
      expect(result.openGraph?.url).toBe('https://other.com/x')
    })

    it('(8) kind article with publishedAt/updatedAt gives openGraph.type article and publishedTime/modifiedTime', async () => {
      const result = await buildMetadata({
        title: 'Blog Post',
        kind: 'article',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-20T15:30:00Z',
      })
      const og = result.openGraph as any
      expect(og?.type).toBe('article')
      expect(og?.publishedTime).toBe('2024-01-15T10:00:00Z')
      expect(og?.modifiedTime).toBe('2024-01-20T15:30:00Z')
    })

    it('(9) twitterHandle in settings gives twitter.site', async () => {
      mockGetSeoContext.mockResolvedValue({
        enabled: true,
        settings: {
          defaults: {
            titleTemplate: null,
            metaDescription: null,
            defaultOgImage: null,
            twitterHandle: '@ex',
          },
          indexing: {
            allowIndexing: true,
            noindexPaths: '',
          },
        },
        siteName: 'Example',
        baseUrl: 'https://example.com',
      } as any)
      const result = await buildMetadata({
        title: 'Page',
      })
      expect(result.twitter?.site).toBe('@ex')
    })

    it('(10) metaTitle used for title when enabled and no titleTemplate in settings', async () => {
      const result = await buildMetadata({
        title: 'Page',
        seo: { metaTitle: 'Custom Title' },
      })
      // When feature is enabled but no feature titleTemplate, site template still applies
      expect(result.title).toBe('Custom Title | Example')
    })

    it('(11) settings.defaults.titleTemplate applies when feature enabled', async () => {
      mockGetSeoContext.mockResolvedValue({
        enabled: true,
        settings: {
          defaults: {
            titleTemplate: '%page% – %site%',
            metaDescription: null,
            defaultOgImage: null,
            twitterHandle: null,
          },
          indexing: {
            allowIndexing: true,
            noindexPaths: '',
          },
        },
        siteName: 'Example',
        baseUrl: 'https://example.com',
      } as any)
      const result = await buildMetadata({
        title: 'Page',
        seo: { metaTitle: 'Article' },
      })
      expect(result.title).toBe('Article – Example')
    })

    it('(12) seo.noIndex true gives robots.index false and follow false; noFollow only gives index true follow false', async () => {
      const resultNoIndex = await buildMetadata({
        title: 'Page',
        seo: { noIndex: true },
      })
      const robotsNoIndex = resultNoIndex.robots as any
      expect(robotsNoIndex?.index).toBe(false)
      expect(robotsNoIndex?.follow).toBe(false)

      const resultNoFollow = await buildMetadata({
        title: 'Page',
        seo: { noFollow: true },
      })
      const robotsNoFollow = resultNoFollow.robots as any
      expect(robotsNoFollow?.index).toBe(true)
      expect(robotsNoFollow?.follow).toBe(false)
    })

    it('(13) site-level indexing disabled gives robots.index false', async () => {
      mockGetSeoContext.mockResolvedValue({
        enabled: true,
        settings: {
          defaults: {
            titleTemplate: null,
            metaDescription: null,
            defaultOgImage: null,
            twitterHandle: null,
          },
          indexing: {
            allowIndexing: false,
            noindexPaths: '',
          },
        },
        siteName: 'Example',
        baseUrl: 'https://example.com',
      } as any)
      const result = await buildMetadata({
        title: 'Page',
      })
      const robots = result.robots as any
      expect(robots?.index).toBe(false)
    })
  })
})
