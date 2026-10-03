import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPageJsonLd } from '@/features/seo/pageSchema'
import { PageJsonLd } from '@/features/seo'
import type { SeoContext } from '@/features/seo/settings'

// Mock getSeoContext
vi.mock('@/features/seo/settings', async (orig) => {
  const module = await orig() as any
  return {
    ...module,
    getSeoContext: vi.fn(),
  }
})

import { getSeoContext } from '@/features/seo/settings'

const mockGetSeoContext = vi.mocked(getSeoContext)

describe('buildPageJsonLd', () => {
  describe('Basic structure', () => {
    it('returns null when title is empty', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: '',
        url: 'https://example.com/about',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result).toBeNull()
    })

    it('includes @context, @type, @id, url, name, isPartOf', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: 'About Us',
        url: 'https://example.com/about',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result).not.toBeNull()
      expect(result?.['@context']).toBe('https://schema.org')
      expect(result?.['@type']).toBe('WebPage')
      expect(result?.['@id']).toBe('https://example.com/about#webpage')
      expect(result?.url).toBe('https://example.com/about')
      expect(result?.name).toBe('About Us')
      expect((result?.isPartOf as any)?.['@id']).toBe('https://example.com/#website')
    })

    it('omits undefined keys', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: 'Page',
        url: 'https://example.com/test',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.description).toBeUndefined()
      expect(result?.datePublished).toBeUndefined()
      expect(result?.primaryImageOfPage).toBeUndefined()
    })

    it('includes description when provided', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: 'Page',
        description: 'A test page',
        url: 'https://example.com/test',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.description).toBe('A test page')
    })
  })

  describe('Page types', () => {
    it('WebPage (default for pages collection)', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: 'Home',
        url: 'https://example.com',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('WebPage')
    })

    it('AboutPage when schemaType is set', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'AboutPage',
        title: 'About',
        url: 'https://example.com/about',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('AboutPage')
    })

    it('ContactPage', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'ContactPage',
        title: 'Contact',
        url: 'https://example.com/contact',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('ContactPage')
    })

    it('FAQPage', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'FAQPage',
        title: 'FAQs',
        url: 'https://example.com/faq',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('FAQPage')
    })

    it('BlogPosting (default for posts collection)', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        title: 'My Blog Post',
        url: 'https://example.com/blog/post',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('BlogPosting')
    })

    it('Article when schemaType is set on posts', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        schemaType: 'Article',
        title: 'Article Title',
        url: 'https://example.com/blog/article',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('Article')
    })

    it('NewsArticle for posts', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        schemaType: 'NewsArticle',
        title: 'News',
        url: 'https://example.com/blog/news',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('NewsArticle')
    })

    it('Product (default for products collection)', () => {
      const result = buildPageJsonLd({
        collection: 'products',
        title: 'Widget',
        url: 'https://example.com/shop/widget',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('Product')
    })

    it('Event (default for events collection)', () => {
      const result = buildPageJsonLd({
        collection: 'events',
        title: 'Conference',
        url: 'https://example.com/events/conf',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('Event')
    })

    it('Course (default for courses collection)', () => {
      const result = buildPageJsonLd({
        collection: 'courses',
        title: 'Learning Course',
        url: 'https://example.com/courses/learn',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('Course')
    })
  })

  describe('Article-family types (BlogPosting, Article, NewsArticle)', () => {
    it('includes headline and author (Person) when authorName provided', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        schemaType: 'BlogPosting',
        title: 'Blog Post',
        url: 'https://example.com/blog/post',
        baseUrl: 'https://example.com',
        siteName: 'Example',
        authorName: 'Jane Doe',
      })
      expect(result?.headline).toBe('Blog Post')
      expect((result?.author as any)?.['@type']).toBe('Person')
      expect((result?.author as any)?.name).toBe('Jane Doe')
    })

    it('includes author as Organization (siteName) when no authorName', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        schemaType: 'Article',
        title: 'Article',
        url: 'https://example.com/blog/article',
        baseUrl: 'https://example.com',
        siteName: 'Example Publishing',
      })
      expect((result?.author as any)?.['@type']).toBe('Organization')
      expect((result?.author as any)?.name).toBe('Example Publishing')
    })

    it('includes mainEntityOfPage', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        title: 'Article',
        url: 'https://example.com/blog/article',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect((result?.mainEntityOfPage as any)?.['@id']).toBe('https://example.com/blog/article')
    })
  })

  describe('Product type', () => {
    it('includes name and description', () => {
      const result = buildPageJsonLd({
        collection: 'products',
        title: 'Product Name',
        description: 'Product description',
        url: 'https://example.com/shop/product',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.name).toBe('Product Name')
      expect(result?.description).toBe('Product description')
    })

    it('includes image when imageUrl provided', () => {
      const result = buildPageJsonLd({
        collection: 'products',
        title: 'Product',
        imageUrl: 'https://example.com/images/product.jpg',
        url: 'https://example.com/shop/product',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.image).toBe('https://example.com/images/product.jpg')
    })
  })

  describe('Event type', () => {
    it('includes startDate and endDate when provided', () => {
      const result = buildPageJsonLd({
        collection: 'events',
        title: 'Conference',
        datePublished: '2024-06-01T09:00:00Z',
        dateModified: '2024-06-01T17:00:00Z',
        url: 'https://example.com/events/conf',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.startDate).toBe('2024-06-01T09:00:00Z')
      expect(result?.endDate).toBe('2024-06-01T17:00:00Z')
    })
  })

  describe('Course type', () => {
    it('includes provider Organization', () => {
      const result = buildPageJsonLd({
        collection: 'courses',
        title: 'Course',
        url: 'https://example.com/courses/course1',
        baseUrl: 'https://example.com',
        siteName: 'Learning Institute',
      })
      expect((result?.provider as any)?.['@type']).toBe('Organization')
      expect((result?.provider as any)?.name).toBe('Learning Institute')
    })
  })

  describe('Images', () => {
    it('includes primaryImageOfPage when imageUrl provided', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: 'Page',
        imageUrl: 'https://example.com/image.jpg',
        url: 'https://example.com/page',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect((result?.primaryImageOfPage as any)?.['@type']).toBe('ImageObject')
      expect((result?.primaryImageOfPage as any)?.url).toBe('https://example.com/image.jpg')
    })
  })

  describe('Dates', () => {
    it('includes datePublished when provided', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        title: 'Post',
        datePublished: '2024-01-15T10:00:00Z',
        url: 'https://example.com/blog/post',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.datePublished).toBe('2024-01-15T10:00:00Z')
    })

    it('includes dateModified when provided', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        title: 'Post',
        dateModified: '2024-01-20T15:30:00Z',
        url: 'https://example.com/blog/post',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.dateModified).toBe('2024-01-20T15:30:00Z')
    })
  })

  describe('Special types (MenuPage, LocalBusinessPage)', () => {
    it('MenuPage gives WebPage @type with mainEntity Menu', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'MenuPage',
        title: 'Our Menu',
        url: 'https://example.com/menu',
        baseUrl: 'https://example.com',
        siteName: 'Restaurant',
      })
      expect(result?.['@type']).toBe('WebPage')
      expect((result?.mainEntity as any)?.['@type']).toBe('Menu')
      expect((result?.mainEntity as any)?.name).toBe('Our Menu')
    })

    it('LocalBusinessPage gives WebPage @type with about LocalBusiness', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'LocalBusinessPage',
        title: 'Contact Us',
        url: 'https://example.com/contact',
        baseUrl: 'https://example.com',
        siteName: 'Local Shop',
      })
      expect(result?.['@type']).toBe('WebPage')
      expect((result?.about as any)?.['@type']).toBe('LocalBusiness')
      expect((result?.about as any)?.name).toBe('Local Shop')
    })
  })

  describe('Escaping and XSS protection', () => {
    it('escapes </script> in title when serialized', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        title: '</script><script>alert("xss")</script>',
        url: 'https://example.com/test',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      const json = JSON.stringify(result!).replaceAll('</', '<\\/')
      expect(json).toContain('<\\/script>')
      expect(json).not.toContain('</script>')
    })
  })

  describe('Unknown/fallback schemaType', () => {
    it('falls back to content-type default for unknown schemaType', () => {
      const result = buildPageJsonLd({
        collection: 'pages',
        schemaType: 'UnknownType',
        title: 'Page',
        url: 'https://example.com/page',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('WebPage')
    })

    it('falls back to content-type default when schemaType is null', () => {
      const result = buildPageJsonLd({
        collection: 'posts',
        schemaType: null,
        title: 'Post',
        url: 'https://example.com/blog/post',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('BlogPosting')
    })

    it('falls back to WebPage when collection unknown', () => {
      const result = buildPageJsonLd({
        collection: 'unknownCollection',
        title: 'Page',
        url: 'https://example.com/page',
        baseUrl: 'https://example.com',
        siteName: 'Example',
      })
      expect(result?.['@type']).toBe('WebPage')
    })
  })
})

describe('PageJsonLd component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Feature disabled', () => {
    beforeEach(() => {
      mockGetSeoContext.mockResolvedValue({
        enabled: false,
        settings: null,
        siteName: 'Example',
        baseUrl: 'https://example.com',
      })
    })

    it('returns null when feature disabled', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: { title: 'Page' },
        path: '/page',
      })
      expect(result).toBeNull()
    })
  })

  describe('Feature enabled', () => {
    beforeEach(() => {
      mockGetSeoContext.mockResolvedValue({
        enabled: true,
        settings: null,
        siteName: 'Example',
        baseUrl: 'https://example.com',
      })
    })

    it('returns null when doc is null', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: null,
        path: '/page',
      })
      expect(result).toBeNull()
    })

    it('returns null when doc.seo.noIndex is true', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: { title: 'Page', seo: { noIndex: true } },
        path: '/page',
      })
      expect(result).toBeNull()
    })

    it('returns null when no title', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: {},
        path: '/page',
      })
      expect(result).toBeNull()
    })

    it('renders script tag with JSON-LD data', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: { title: 'Page', schemaType: 'AboutPage' },
        path: '/about',
      })
      expect((result as any)?.type).toBe('script')
      expect((result as any)?.props?.type).toBe('application/ld+json')
      expect((result as any)?.props?.dangerouslySetInnerHTML).toBeDefined()
      const html = (result as any)?.props?.dangerouslySetInnerHTML?.__html
      expect(html).toContain('"@type":"AboutPage"')
      expect(html).toContain('https://example.com/about')
    })

    it('uses seo.metaTitle when available', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: { title: 'Display Title', seo: { metaTitle: 'SEO Title' } },
        path: '/page',
      })
      const html = (result as any)?.props?.dangerouslySetInnerHTML?.__html
      expect(html).toContain('"name":"SEO Title"')
    })

    it('escapes </script> in output', async () => {
      const result = await PageJsonLd({
        collection: 'pages',
        doc: { title: 'Title</script><script>alert("xss")</script>' },
        path: '/page',
      })
      const html = (result as any)?.props?.dangerouslySetInnerHTML?.__html
      expect(html).toContain('<\\\/')
      expect(html).not.toContain('</script>')
    })

    it('includes datePublished from doc.publishedDate', async () => {
      const result = await PageJsonLd({
        collection: 'posts',
        doc: { title: 'Post', publishedDate: '2024-01-15T10:00:00Z' },
        path: '/blog/post',
      })
      const html = (result as any)?.props?.dangerouslySetInnerHTML?.__html
      expect(html).toContain('"datePublished":"2024-01-15T10:00:00Z"')
    })

    it('includes authorName from doc.author.email', async () => {
      const result = await PageJsonLd({
        collection: 'posts',
        doc: { title: 'Post', author: { email: 'author@example.com' } },
        path: '/blog/post',
      })
      const html = (result as any)?.props?.dangerouslySetInnerHTML?.__html
      expect(html).toContain('"name":"author@example.com"')
    })

    describe('Collection/List pages (CollectionPage)', () => {
      it('CollectionPage schema type for blog list', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Journal',
          description: 'All blog posts',
          url: 'https://example.com/blog',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.['@type']).toBe('CollectionPage')
        expect(result?.name).toBe('Journal')
        expect(result?.description).toBe('All blog posts')
        expect(result?.url).toBe('https://example.com/blog')
      })

      it('CollectionPage schema type for shop/products list', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Shop',
          url: 'https://example.com/shop',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.['@type']).toBe('CollectionPage')
        expect(result?.name).toBe('Shop')
        expect(result?.url).toBe('https://example.com/shop')
      })

      it('CollectionPage schema type for events list', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Events',
          description: 'Upcoming events and gatherings',
          url: 'https://example.com/events',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.['@type']).toBe('CollectionPage')
        expect(result?.name).toBe('Events')
        expect(result?.description).toBe('Upcoming events and gatherings')
      })

      it('CollectionPage includes isPartOf reference to website', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Blog',
          url: 'https://example.com/blog',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.isPartOf).toEqual({ '@id': 'https://example.com/#website' })
      })

      it('CollectionPage with image', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Shop',
          imageUrl: 'https://example.com/shop-hero.jpg',
          url: 'https://example.com/shop',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.primaryImageOfPage).toEqual({
          '@type': 'ImageObject',
          url: 'https://example.com/shop-hero.jpg',
        })
      })

      it('CollectionPage without description', () => {
        const result = buildPageJsonLd({
          collection: 'pages',
          schemaType: 'CollectionPage',
          title: 'Events',
          url: 'https://example.com/events',
          baseUrl: 'https://example.com',
          siteName: 'Example',
        })
        expect(result?.description).toBeUndefined()
      })
    })

    describe('List page JSON-LD when feature disabled', () => {
      it('blog list returns null when feature disabled', async () => {
        mockGetSeoContext.mockResolvedValue({
          enabled: false,
          settings: null,
          siteName: 'Example',
          baseUrl: 'https://example.com',
        })
        const result = await PageJsonLd({
          collection: 'posts',
          doc: undefined,
          path: '/blog',
        })
        expect(result).toBeNull()
      })

      it('shop list returns null when feature disabled', async () => {
        mockGetSeoContext.mockResolvedValue({
          enabled: false,
          settings: null,
          siteName: 'Example',
          baseUrl: 'https://example.com',
        })
        const result = await PageJsonLd({
          collection: 'products',
          doc: undefined,
          path: '/shop',
        })
        expect(result).toBeNull()
      })

      it('events list returns null when feature disabled', async () => {
        mockGetSeoContext.mockResolvedValue({
          enabled: false,
          settings: null,
          siteName: 'Example',
          baseUrl: 'https://example.com',
        })
        const result = await PageJsonLd({
          collection: 'events',
          doc: undefined,
          path: '/events',
        })
        expect(result).toBeNull()
      })
    })
  })
})
