import { describe, it, expect } from 'vitest'
import { buildPageJsonLd } from '@/features/seo/pageSchema'
import { breadcrumbList, breadcrumbTrail, eventNodes, eventOffers, faqEntities, plainText, type EventFacts } from '@/features/seo/schemaNodes'
import { articleFacts, authorNameOf } from '@/features/seo/pageSchemaData'
import type { TicketTier } from '@/features/editScreens/tiers'

const BASE = 'https://example.com'
const NOW = new Date('2026-10-14T00:00:00Z')

const tier = (over: Partial<TicketTier>): TicketTier => ({
  name: 'General',
  description: '',
  price: 20,
  capacity: null,
  salesEnd: null,
  ...over,
})

const richText = (...paragraphs: string[]) => ({
  root: { children: paragraphs.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] })) },
})

const facts = (over: Partial<EventFacts> = {}): EventFacts => ({
  url: `${BASE}/events/conf`,
  isOnline: false,
  tiers: [],
  now: NOW,
  ...over,
})

describe('plainText', () => {
  it('joins the text of a rich text tree', () => {
    expect(plainText(richText('Hello', 'world'))).toBe('Hello world')
  })

  it('strips HTML from a string', () => {
    expect(plainText('<p>Hi <b>there</b></p>')).toBe('Hi there')
  })

  it('returns an empty string for nothing', () => {
    expect(plainText(undefined)).toBe('')
  })
})

describe('faqEntities', () => {
  it('builds Question and Answer nodes and drops entries missing a question or answer', () => {
    const entities = faqEntities([
      { question: 'Q1', answer: richText('A1') },
      { question: '', answer: richText('orphan answer') },
      { question: 'Q3', answer: '' },
    ])
    expect(entities).toHaveLength(1)
    expect(entities[0]).toEqual({
      '@type': 'Question',
      name: 'Q1',
      acceptedAnswer: { '@type': 'Answer', text: 'A1' },
    })
  })

  it('caps the list at 50 entries', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ question: `Q${i}`, answer: `A${i}` }))
    expect(faqEntities(many)).toHaveLength(50)
  })
})

describe('breadcrumbList', () => {
  it('returns nothing for fewer than two entries', () => {
    expect(breadcrumbList([])).toBeUndefined()
    expect(breadcrumbList([{ name: 'Home', url: `${BASE}/` }])).toBeUndefined()
  })

  it('numbers the entries from 1', () => {
    const node = breadcrumbList([
      { name: 'Home', url: `${BASE}/` },
      { name: 'Blog', url: `${BASE}/blog` },
    ])
    expect(node).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE}/blog` },
      ],
    })
  })
})

describe('breadcrumbTrail', () => {
  it('walks a page through its ancestors, Home first', () => {
    const crumbs = breadcrumbTrail({
      collection: 'pages',
      baseUrl: BASE,
      path: '/about/team',
      title: 'Team',
      pageTrail: [{ name: 'About', path: '/about' }],
    })
    expect(crumbs.map((c) => c.name)).toEqual(['Home', 'About', 'Team'])
    expect(crumbs.map((c) => c.url)).toEqual([`${BASE}/`, `${BASE}/about`, `${BASE}/about/team`])
  })

  it('places posts under Blog, products under Shop and events under Events', () => {
    expect(breadcrumbTrail({ collection: 'posts', baseUrl: BASE, path: '/blog/post', title: 'Post' }).map((c) => c.name)).toEqual(['Home', 'Blog', 'Post'])
    expect(breadcrumbTrail({ collection: 'products', baseUrl: BASE, path: '/shop/widget', title: 'Widget' }).map((c) => c.name)).toEqual(['Home', 'Shop', 'Widget'])
    expect(breadcrumbTrail({ collection: 'events', baseUrl: BASE, path: '/events/conf', title: 'Conf' }).map((c) => c.name)).toEqual(['Home', 'Events', 'Conf'])
  })

  it('has no trail on the homepage', () => {
    expect(breadcrumbTrail({ collection: 'pages', baseUrl: BASE, path: '/', title: 'Home' })).toEqual([])
  })
})

describe('eventNodes', () => {
  it('online events get a VirtualLocation and the online attendance mode', () => {
    const node = eventNodes(facts({ isOnline: true, venueName: 'Hall', address: '1 Road' }))
    expect(node.location).toEqual({ '@type': 'VirtualLocation', url: `${BASE}/events/conf` })
    expect(node.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
  })

  it('in-person events get a Place with a postal address', () => {
    const node = eventNodes(facts({ venueName: 'Town Hall', address: '1 Main Street' }))
    expect(node.location).toEqual({
      '@type': 'Place',
      name: 'Town Hall',
      address: { '@type': 'PostalAddress', streetAddress: '1 Main Street' },
    })
    expect(node.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
  })

  it('leaves out location when there is no venue, address or online link', () => {
    const node = eventNodes(facts())
    expect(node.location).toBeUndefined()
    expect(node.eventAttendanceMode).toBeUndefined()
    expect(node.eventStatus).toBe('https://schema.org/EventScheduled')
  })

  it('names the organizer when given', () => {
    expect(eventNodes(facts({ organizerName: 'Example Org' })).organizer).toEqual({ '@type': 'Organization', name: 'Example Org' })
  })
})

describe('eventOffers', () => {
  it('offers each tier still on sale and skips expired ones', () => {
    const offers = eventOffers(
      facts({
        tiers: [tier({ name: 'Early', price: 15, salesEnd: '2026-12-01' }), tier({ name: 'Old', price: 10, salesEnd: '2020-01-01' })],
      }),
    )
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({ '@type': 'Offer', name: 'Early', price: 15, priceCurrency: 'AUD', validThrough: '2026-12-01' })
  })

  it('keeps a free tier as a price of 0', () => {
    const offers = eventOffers(facts({ tiers: [tier({ name: 'Free', price: 0 })] }))
    expect(offers[0]).toMatchObject({ name: 'Free', price: 0 })
  })

  it('uses the ticket product price when there are no tiers', () => {
    expect(eventOffers(facts({ ticketPrice: 30 }))).toEqual([expect.objectContaining({ name: 'Ticket', price: 30 })])
  })

  it('offers nothing when there is no price at all', () => {
    expect(eventOffers(facts({ ticketPrice: null }))).toEqual([])
    expect(eventNodes(facts({ ticketPrice: null })).offers).toBeUndefined()
  })
})

describe('buildPageJsonLd - event fixes', () => {
  it('takes the end date from endDate, never from dateModified', () => {
    const node = buildPageJsonLd({
      collection: 'events',
      title: 'Conf',
      url: `${BASE}/events/conf`,
      baseUrl: BASE,
      siteName: 'Example',
      startDate: '2026-11-01T09:00:00Z',
      endDate: '2026-11-01T17:00:00Z',
      dateModified: '2026-10-10T00:00:00Z',
    })
    expect(node?.startDate).toBe('2026-11-01T09:00:00Z')
    expect(node?.endDate).toBe('2026-11-01T17:00:00Z')
    expect(node?.dateModified).toBe('2026-10-10T00:00:00Z')
  })

  it('has no endDate when only dateModified is set', () => {
    const node = buildPageJsonLd({
      collection: 'events',
      title: 'Conf',
      url: `${BASE}/events/conf`,
      baseUrl: BASE,
      siteName: 'Example',
      dateModified: '2026-10-10T00:00:00Z',
    })
    expect(node?.endDate).toBeUndefined()
  })
})

describe('buildPageJsonLd - article, product, FAQ and breadcrumb', () => {
  it('adds word count, section, keywords and language to articles', () => {
    const node = buildPageJsonLd({
      collection: 'posts',
      title: 'Post',
      url: `${BASE}/blog/post`,
      baseUrl: BASE,
      siteName: 'Example',
      wordCount: 420,
      articleSection: 'News',
      keywords: 'seo tips',
      inLanguage: 'en',
    })
    expect(node).toMatchObject({ wordCount: 420, articleSection: 'News', keywords: 'seo tips', inLanguage: 'en' })
  })

  it('omits the author when there is no name', () => {
    const node = buildPageJsonLd({ collection: 'posts', title: 'Post', url: `${BASE}/blog/post`, baseUrl: BASE, siteName: 'Example' })
    expect(node?.author).toBeUndefined()
  })

  it('adds sku and brand to products when given', () => {
    const node = buildPageJsonLd({
      collection: 'products',
      title: 'Widget',
      url: `${BASE}/shop/widget`,
      baseUrl: BASE,
      siteName: 'Example',
      sku: 'SKU-1',
      brand: 'Acme',
    })
    expect(node).toMatchObject({ sku: 'SKU-1', brand: { '@type': 'Brand', name: 'Acme' } })
  })

  it('emits FAQ questions as mainEntity', () => {
    const node = buildPageJsonLd({
      collection: 'pages',
      schemaType: 'FAQPage',
      title: 'FAQ',
      url: `${BASE}/faq`,
      baseUrl: BASE,
      siteName: 'Example',
      faqs: [{ question: 'Is it free?', answer: richText('Yes.') }],
    })
    expect(node?.['@type']).toBe('FAQPage')
    expect(node?.mainEntity).toEqual([
      { '@type': 'Question', name: 'Is it free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
    ])
  })

  it('embeds the breadcrumb trail on the page node', () => {
    const node = buildPageJsonLd({
      collection: 'pages',
      title: 'Team',
      url: `${BASE}/about/team`,
      baseUrl: BASE,
      siteName: 'Example',
      breadcrumbs: [
        { name: 'Home', url: `${BASE}/` },
        { name: 'About', url: `${BASE}/about` },
        { name: 'Team', url: `${BASE}/about/team` },
      ],
    })
    expect((node?.breadcrumb as { '@type': string })?.['@type']).toBe('BreadcrumbList')
  })
})

describe('article and author helpers', () => {
  it('counts words, takes the first category and the focus keyphrase', () => {
    const facts = articleFacts({
      categories: [{ name: 'News' }, { name: 'Other' }],
      seo: { focusKeyphrase: ' seo ' },
      content: richText('one two three'),
    })
    expect(facts).toMatchObject({ wordCount: 3, articleSection: 'News', keywords: 'seo', inLanguage: 'en' })
  })

  it('leaves out empty article facts', () => {
    const facts = articleFacts({})
    expect(facts.wordCount).toBeUndefined()
    expect(facts.articleSection).toBeUndefined()
    expect(facts.keywords).toBeUndefined()
  })

  it('uses the author name and never the email', () => {
    expect(authorNameOf({ email: 'a@b.example' })).toBeUndefined()
    expect(authorNameOf({ name: ' Jane ', email: 'a@b.example' })).toBe('Jane')
    expect(authorNameOf('someone')).toBeUndefined()
  })
})
