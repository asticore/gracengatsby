import { describe, it, expect, vi } from 'vitest'
import { buildMetadata } from '@/utilities/seo'
import { resolveSeo, applyTitleTemplate } from '@/features/seo/resolve'
import type { SeoInput } from '@/features/seo/resolve'
import type { SeoContext } from '@/features/seo/settings'
import type { Metadata } from 'next'

describe('buildMetadata', () => {
  it('builds basic metadata with title only', async () => {
    const metadata = await buildMetadata({ title: 'Test Page' })
    expect(metadata.title).toBe('Test Page')
    expect((metadata.robots as any)?.index).toBe(true)
    expect((metadata.robots as any)?.follow).toBe(true)
  })

  it('includes meta description from seo.metaDescription', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { metaDescription: 'Test description' },
    })
    expect(metadata.description).toBe('Test description')
  })

  it('builds OG title and description from socialTitle and socialDescription', async () => {
    const metadata = await buildMetadata({
      title: 'Test Page',
      seo: {
        socialTitle: 'Social Title',
        socialDescription: 'Social Description',
      },
    })
    expect(metadata.openGraph?.title).toBe('Social Title')
    expect(metadata.openGraph?.description).toBe('Social Description')
  })

  it('falls back OG title to page title when socialTitle is not set', async () => {
    const metadata = await buildMetadata({
      title: 'Page Title',
      seo: { socialDescription: 'Social Desc' },  // socialTitle not set
    })
    expect(metadata.openGraph?.title).toBe('Page Title')
  })

  it('uses OG image from seo.ogImage when available', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { ogImage: 'https://example.com/image.jpg' },
    })
    expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/image.jpg' })
  })

  it('falls back to featured image when seo.ogImage is not set', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      featuredImage: 'https://example.com/featured.jpg',
    })
    expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/featured.jpg' })
  })

  it('prioritizes seo.ogImage over featuredImage', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { ogImage: 'https://example.com/seo.jpg' },
      featuredImage: 'https://example.com/featured.jpg',
    })
    expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/seo.jpg' })
  })

  it('sets noindex and nofollow robots rules correctly', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { noIndex: true },
    })
    expect((metadata.robots as any)?.index).toBe(false)
    expect((metadata.robots as any)?.follow).toBe(false)
  })

  it('sets follow:false when noFollow is true', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { noFollow: true },
    })
    expect((metadata.robots as any)?.index).toBe(true)
    expect((metadata.robots as any)?.follow).toBe(false)
  })

  it('sets canonical URL from seo.canonicalUrl (absolute) when path is provided', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { canonicalUrl: 'https://other.com/page' },
    })
    expect(metadata.alternates?.canonical).toBe('https://other.com/page')
  })

  it('sets canonical URL from seo.canonicalUrl (path)', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      path: '/blog/post',
      seo: { canonicalUrl: '/other-path' },
    })
    expect(metadata.alternates?.canonical).toMatch(/https:\/\/.*\/other-path$/)
  })

  it('uses X card type from seo.xCard', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { xCard: 'summary' },
    })
    const twitter = metadata.twitter as { card?: string }
    expect(twitter?.card).toBe('summary')
  })

  it('defaults X card to summary_large_image when image exists', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { ogImage: 'https://example.com/image.jpg' },
    })
    const twitter = metadata.twitter as { card?: string }
    expect(twitter?.card).toBe('summary_large_image')
  })

  it('keeps the large image card by default when an image is present', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { ogImage: 'https://example.com/image.jpg' },
    })
    const twitter = metadata.twitter as { card?: string }
    expect(twitter?.card).toBe('summary_large_image')
  })

  it('honours an explicit xCard of summary', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { xCard: 'summary' },
    })
    const twitter = metadata.twitter as { card?: string }
    expect(twitter?.card).toBe('summary')
  })

  it('uses X image when set', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: {
        ogImage: 'https://example.com/og.jpg',
        xImage: 'https://example.com/x.jpg',
      },
    })
    expect(metadata.twitter?.images).toContain('https://example.com/x.jpg')
  })

  it('falls back X image to social image chain', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      seo: { ogImage: 'https://example.com/og.jpg' },
    })
    expect(metadata.twitter?.images).toContain('https://example.com/og.jpg')
  })

  it('preserves OG and X title/description consistency', async () => {
    const metadata = await buildMetadata({
      title: 'Page Title',
      seo: {
        socialTitle: 'Social Title',
        socialDescription: 'Social Desc',
      },
    })
    expect(metadata.openGraph?.title).toBe('Social Title')
    expect(metadata.openGraph?.description).toBe('Social Desc')
    expect(metadata.twitter?.title).toBe('Social Title')
    expect(metadata.twitter?.description).toBe('Social Desc')
  })

  it('backward compatible: no changes when new fields are not set', async () => {
    const metadata = await buildMetadata({
      title: 'Page Title',
      seo: {
        metaDescription: 'Meta Desc',
        ogImage: 'https://example.com/og.jpg',
        noIndex: false,
      },
    })
    expect(metadata.title).toBe('Page Title')
    expect(metadata.description).toBe('Meta Desc')
    expect((metadata.robots as any)?.index).toBe(true)
    expect((metadata.robots as any)?.follow).toBe(true)
  })

  describe('Events metadata', () => {
    it('event with seo group: metaTitle overrides title', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        seo: { metaTitle: 'Exclusive Summer Gala 2024' },
        path: '/events/summer-gala',
        kind: 'article',
        publishedAt: '2024-06-01T10:00:00Z',
      })
      expect(metadata.title).toBe('Exclusive Summer Gala 2024')
    })

    it('event with seo.metaDescription', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        seo: { metaDescription: 'Join us for an exclusive evening' },
        path: '/events/summer-gala',
      })
      expect(metadata.description).toBe('Join us for an exclusive evening')
    })

    it('event with seo.ogImage uses it for OG image', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        seo: { ogImage: 'https://example.com/gala.jpg' },
        path: '/events/summer-gala',
      })
      expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/gala.jpg' })
    })

    it('event with coverImage uses it as fallback OG image when seo.ogImage not set', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        featuredImage: 'https://example.com/cover.jpg',
        path: '/events/summer-gala',
      })
      expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/cover.jpg' })
    })

    it('event seo.ogImage takes precedence over coverImage', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        seo: { ogImage: 'https://example.com/seo.jpg' },
        featuredImage: 'https://example.com/cover.jpg',
        path: '/events/summer-gala',
      })
      expect(metadata.openGraph?.images).toContainEqual({ url: 'https://example.com/seo.jpg' })
    })

    it('event without seo fields produces same output as before SEO addition', async () => {
      const metadata = await buildMetadata({
        title: 'Community Meetup',
        path: '/events/community-meetup',
        kind: 'article',
        publishedAt: '2024-07-15T14:00:00Z',
        updatedAt: '2024-07-20T14:00:00Z',
      })
      expect(metadata.title).toBe('Community Meetup')
      expect(metadata.description).toBeUndefined() // falls back to site default
      expect((metadata.robots as any)?.index).toBe(true)
    })

    it('event with seo.noIndex hides from search', async () => {
      const metadata = await buildMetadata({
        title: 'Private Event',
        seo: { noIndex: true },
        path: '/events/private',
      })
      expect((metadata.robots as any)?.index).toBe(false)
      expect((metadata.robots as any)?.follow).toBe(false)
    })

    it('event with seo.socialTitle and socialDescription for sharing', async () => {
      const metadata = await buildMetadata({
        title: 'Summer Gala',
        seo: {
          socialTitle: 'You are invited to Summer Gala',
          socialDescription: 'An exclusive evening of cocktails and dancing',
        },
        path: '/events/summer-gala',
      })
      expect(metadata.openGraph?.title).toBe('You are invited to Summer Gala')
      expect(metadata.openGraph?.description).toBe('An exclusive evening of cocktails and dancing')
    })

    it('event accepts xCard setting for Twitter', async () => {
      const metadata = await buildMetadata({
        title: 'Event',
        seo: { xCard: 'summary_large_image' },
        path: '/events/test',
      })
      expect((metadata.twitter as any)?.card).toBe('summary_large_image')
    })

    it('event with xImage uses it for Twitter image', async () => {
      const metadata = await buildMetadata({
        title: 'Event',
        seo: { xImage: 'https://example.com/twitter.jpg' },
        path: '/events/test',
      })
      expect(metadata.twitter?.images).toContainEqual('https://example.com/twitter.jpg')
    })
  })
})

describe('resolveSeo', () => {
  const mockContext: SeoContext = {
    enabled: true,
    settings: {
      defaults: {
        titleTemplate: '%page% | %site%',
        metaDescription: 'Site default description',
        defaultOgImage: 'https://example.com/default-og.jpg' as any,
        twitterHandle: '@example',
      },
      indexing: {
        allowIndexing: true,
        noindexPaths: '',
      },
    } as any,
    siteName: 'My Site',
    baseUrl: 'https://example.com',
  }

  it('resolves OG title from socialTitle', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { socialTitle: 'Social Title' },
    })
    expect(result.socialTitle).toBe('Social Title')
  })

  it('leaves socialTitle empty unless one is set (callers then use the templated title)', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page Title',
    })
    expect(result.socialTitle).toBeUndefined()
    const explicit = resolveSeo(mockContext, { title: 'Page Title', seo: { socialTitle: 'Share me' } })
    expect(explicit.socialTitle).toBe('Share me')
  })

  it('resolves image fallback chain: ogImage > featuredImage > default', () => {
    const resultWithOg = resolveSeo(mockContext, {
      title: 'Page',
      seo: { ogImage: 'https://example.com/og.jpg' },
      featuredImage: 'https://example.com/featured.jpg',
    })
    expect(resultWithOg.image?.url).toBe('https://example.com/og.jpg')

    const resultWithFeatured = resolveSeo(mockContext, {
      title: 'Page',
      featuredImage: 'https://example.com/featured.jpg',
    })
    expect(resultWithFeatured.image?.url).toBe('https://example.com/featured.jpg')

    const resultWithDefault = resolveSeo(mockContext, {
      title: 'Page',
    })
    expect(resultWithDefault.image?.url).toBe('https://example.com/default-og.jpg')
  })

  it('resolves X image fallback chain: xImage > social image chain', () => {
    const resultWithX = resolveSeo(mockContext, {
      title: 'Page',
      seo: {
        ogImage: 'https://example.com/og.jpg',
        xImage: 'https://example.com/x.jpg',
      },
    })
    expect(resultWithX.twitterImage?.url).toBe('https://example.com/x.jpg')

    const resultFallback = resolveSeo(mockContext, {
      title: 'Page',
      seo: { ogImage: 'https://example.com/og.jpg' },
    })
    expect(resultFallback.twitterImage?.url).toBe('https://example.com/og.jpg')
  })

  it('sets xCard from seo.xCard', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { xCard: 'summary' },
    })
    expect(result.twitterCard).toBe('summary')
  })

  it('defaults xCard to summary_large_image when image exists', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { ogImage: 'https://example.com/og.jpg' },
    })
    expect(result.twitterCard).toBe('summary_large_image')
  })

  it('uses the large card when the site default image exists, and honours an explicit summary', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
    })
    expect(result.twitterCard).toBe('summary_large_image')
    const explicit = resolveSeo(mockContext, { title: 'Page', seo: { xCard: 'summary' } })
    expect(explicit.twitterCard).toBe('summary')
  })

  it('resolves canonical URL from seo.canonicalUrl (absolute)', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { canonicalUrl: 'https://other.com/page' },
    })
    expect(result.canonical).toBe('https://other.com/page')
  })

  it('resolves canonical URL from seo.canonicalUrl (path)', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      path: '/current-path',
      seo: { canonicalUrl: '/other-path' },
    })
    expect(result.canonical).toBe('https://example.com/other-path')
  })

  it('defaults to path-based canonical when no seo.canonicalUrl', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      path: '/blog/post',
    })
    expect(result.canonical).toBe('https://example.com/blog/post')
  })

  it('sets noFollow when seo.noFollow is true', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { noFollow: true },
    })
    expect(result.noFollow).toBe(true)
  })

  it('sets noFollow when noIndex is true (preserve existing behaviour)', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
      seo: { noIndex: true },
    })
    expect(result.noFollow).toBe(true)
  })

  it('sets noFollow false when neither noFollow nor noIndex are set', () => {
    const result = resolveSeo(mockContext, {
      title: 'Page',
    })
    expect(result.noFollow).toBe(false)
  })
})

describe('applyTitleTemplate', () => {
  it('replaces %page% placeholder', () => {
    const result = applyTitleTemplate('%page% | %site%', 'Page', 'Site')
    expect(result).toBe('Page | Site')
  })

  it('handles %s legacy placeholder', () => {
    const result = applyTitleTemplate('%s', 'Page', 'Site')
    expect(result).toBe('Page')
  })

  it('uses default template when not provided', () => {
    const result = applyTitleTemplate(null, 'Page', 'Site')
    expect(result).toBe('Page | Site')
  })

  it('handles empty page name', () => {
    const result = applyTitleTemplate('%page% | %site%', '', 'Site')
    expect(result).toBe('Site')
  })

  it('removes dangling separators', () => {
    const result = applyTitleTemplate('%page% |', 'Page', 'Site')
    expect(result).toBe('Page')
  })
})

describe('buildMetadata regression guards', () => {
  it('does not emit a canonical unless one is set (the layout-level SEO feature owns the default)', async () => {
    const metadata = await buildMetadata({ title: 'Test', seo: {} })
    expect(metadata.alternates).toBeUndefined()
  })

  it('keeps follow:true for an indexable page and follow:false for noindex, as before', async () => {
    const open = await buildMetadata({ title: 'Test', seo: {} })
    expect((open.robots as any)?.index).toBe(true)
    expect((open.robots as any)?.follow).toBe(true)
    const hidden = await buildMetadata({ title: 'Test', seo: { noIndex: true } })
    expect((hidden.robots as any)?.index).toBe(false)
    expect((hidden.robots as any)?.follow).toBe(false)
  })
})

describe('buildMetadata with kind and publishedAt/updatedAt', () => {
  it('accepts kind parameter for article type', async () => {
    const metadata = await buildMetadata({
      title: 'Blog Post',
      path: '/blog/post',
      kind: 'article',
    })
    expect(metadata.openGraph).toBeDefined()
  })

  it('accepts publishedAt parameter for articles', async () => {
    const metadata = await buildMetadata({
      title: 'Blog Post',
      path: '/blog/post',
      kind: 'article',
      publishedAt: '2024-01-15T10:00:00Z',
    })
    expect(metadata).toBeDefined()
  })

  it('accepts updatedAt parameter for articles', async () => {
    const metadata = await buildMetadata({
      title: 'Blog Post',
      path: '/blog/post',
      kind: 'article',
      publishedAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-20T15:30:00Z',
    })
    expect(metadata).toBeDefined()
  })

  it('includes canonical URL when path is provided', async () => {
    const metadata = await buildMetadata({
      title: 'Test Page',
      path: '/blog/post',
    })
    expect(metadata.alternates?.canonical).toBeDefined()
  })

  it('does not include canonical when path is not provided', async () => {
    const metadata = await buildMetadata({
      title: 'No Path',
    })
    expect(metadata.alternates).toBeUndefined()
  })

  it('accepts custom canonicalUrl in seo field', async () => {
    const metadata = await buildMetadata({
      title: 'Test',
      path: '/blog/post',
      seo: { canonicalUrl: 'https://other.com/page' },
    })
    expect(metadata.alternates?.canonical).toBe('https://other.com/page')
  })

  it('backward compatible: no changes when new fields are not set', async () => {
    const metadata = await buildMetadata({
      title: 'Page Title',
      seo: {
        metaDescription: 'Meta Desc',
        ogImage: 'https://example.com/og.jpg',
        noIndex: false,
      },
    })
    expect(metadata.title).toBe('Page Title')
    expect(metadata.description).toBe('Meta Desc')
    expect((metadata.robots as any)?.index).toBe(true)
    expect((metadata.robots as any)?.follow).toBe(true)
  })
})
