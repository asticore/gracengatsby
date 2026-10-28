import { forEachText } from '@/features/editScreens/textFields'
import { tierOnSale, type TicketTier } from '@/features/editScreens/tiers'

/**
 * Pure builders for the structured-data nodes that PageJsonLd adds to a page:
 * FAQ questions, breadcrumb trails and Event details. No I/O, so every rule here
 * can be tested without a database.
 */

type JsonLdNode = Record<string, unknown>

/** A breadcrumb entry with its absolute address. */
export type Crumb = { name: string; url: string }

/** A breadcrumb entry with a site path, as a page's ancestors are described. */
export type TrailItem = { name: string; path: string }

/** One FAQ entry: the question as text, the answer as rich text (or plain text). */
export type FaqItem = { question: string; answer: unknown }

export const MAX_FAQ_ENTITIES = 50

const CURRENCY = 'AUD'
const ONLINE_MODE = 'https://schema.org/OnlineEventAttendanceMode'
const OFFLINE_MODE = 'https://schema.org/OfflineEventAttendanceMode'
const EVENT_SCHEDULED = 'https://schema.org/EventScheduled'
const IN_STOCK = 'https://schema.org/InStock'

/** Plain text from a rich text tree, an HTML string, or nothing. */
export function plainText(value: unknown): string {
  let raw: string
  if (typeof value === 'string') {
    raw = value.replace(/<[^>]*>/g, ' ')
  } else {
    const parts: string[] = []
    forEachText(value, (text) => parts.push(text))
    raw = parts.join(' ')
  }
  return raw.replace(/\s+/g, ' ').trim()
}

/** Question and Answer nodes for an FAQPage. Entries missing a question or an answer are dropped. */
export function faqEntities(items: FaqItem[]): JsonLdNode[] {
  const entities: JsonLdNode[] = []
  for (const item of items) {
    const question = typeof item.question === 'string' ? item.question.replace(/\s+/g, ' ').trim() : ''
    const answer = plainText(item.answer)
    if (!question || !answer) continue
    entities.push({ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } })
    if (entities.length >= MAX_FAQ_ENTITIES) break
  }
  return entities
}

/** A BreadcrumbList numbered from 1. Fewer than two usable entries means there is no trail to show. */
export function breadcrumbList(crumbs: Crumb[]): JsonLdNode | undefined {
  const usable = crumbs.filter((crumb) => crumb.name && crumb.url)
  if (usable.length < 2) return undefined
  return {
    '@type': 'BreadcrumbList',
    itemListElement: usable.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  }
}

const SECTIONS: Record<string, TrailItem> = {
  posts: { name: 'Blog', path: '/blog' },
  products: { name: 'Shop', path: '/shop' },
  events: { name: 'Events', path: '/events' },
}

/**
 * A site path with its locale prefix applied: `/about` with `/fr` is `/fr/about`,
 * and the homepage `/` with `/fr` is `/fr`. The default language has no prefix.
 */
export function withLocalePrefix(path: string, prefix?: string): string {
  if (!prefix) return path
  return path === '/' ? prefix : `${prefix}${path}`
}

/** Home, then the section or the page's parents, then the item itself. Empty on the homepage. */
export function breadcrumbTrail(input: {
  collection: string
  baseUrl: string
  path: string
  title: string
  pageTrail?: TrailItem[]
  /** Locale prefix for a non-default language, e.g. '/fr'. Empty or omitted for the default language. */
  localePrefix?: string
}): Crumb[] {
  if (input.path === '/' || !input.title) return []
  const at = (path: string): string => `${input.baseUrl}${withLocalePrefix(path, input.localePrefix)}`
  const home: Crumb = { name: 'Home', url: at('/') }
  const self: Crumb = { name: input.title, url: at(input.path) }
  if (input.collection === 'pages') {
    return [home, ...(input.pageTrail ?? []).map((item) => ({ name: item.name, url: at(item.path) })), self]
  }
  const section = SECTIONS[input.collection]
  return section ? [home, { name: section.name, url: at(section.path) }, self] : [home, self]
}

/** Home, then the list page itself, for an index page such as /blog or /shop. */
export function listBreadcrumbs(input: { baseUrl: string; path: string; name: string }): Crumb[] {
  return [
    { name: 'Home', url: `${input.baseUrl}/` },
    { name: input.name, url: `${input.baseUrl}${input.path}` },
  ]
}

export type EventFacts = {
  /** Absolute address of the event page. */
  url: string
  isOnline: boolean
  venueName?: string | null
  address?: string | null
  /** The site organisation, named once and never an email. */
  organizerName?: string | null
  /** Parsed ticket tiers. When there are none, ticketPrice is used. */
  tiers: TicketTier[]
  /** Price of the linked ticket product in dollars, or null. */
  ticketPrice?: number | null
  now?: Date
}

/** Location, attendance mode, status, organizer and offers for an Event node. */
export function eventNodes(facts: EventFacts): JsonLdNode {
  const node: JsonLdNode = { eventStatus: EVENT_SCHEDULED }
  const venue = (facts.venueName || '').trim()
  const address = (facts.address || '').trim()
  if (facts.isOnline) {
    node.eventAttendanceMode = ONLINE_MODE
    node.location = { '@type': 'VirtualLocation', url: facts.url }
  } else if (venue || address) {
    node.eventAttendanceMode = OFFLINE_MODE
    node.location = placeNode(venue, address)
  }
  if (facts.organizerName) node.organizer = { '@type': 'Organization', name: facts.organizerName }
  const offers = eventOffers(facts)
  if (offers.length > 0) node.offers = offers
  return node
}

function placeNode(name: string, address: string): JsonLdNode {
  const place: JsonLdNode = { '@type': 'Place' }
  if (name) place.name = name
  if (address) place.address = { '@type': 'PostalAddress', streetAddress: address }
  return place
}

/** One offer per ticket tier still on sale, or a single offer for a linked ticket product. */
export function eventOffers(facts: EventFacts): JsonLdNode[] {
  const now = facts.now ?? new Date()
  if (facts.tiers.length > 0) {
    return facts.tiers
      .filter((tier) => tierOnSale(tier, now))
      .map((tier) => offerNode({ name: tier.name, price: tier.price, url: facts.url, validThrough: tier.salesEnd }))
  }
  const price = facts.ticketPrice
  if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
    return [offerNode({ name: 'Ticket', price, url: facts.url, validThrough: null })]
  }
  return []
}

function offerNode(input: { name: string; price: number; url: string; validThrough: string | null }): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'Offer',
    name: input.name,
    price: input.price,
    priceCurrency: CURRENCY,
    availability: IN_STOCK,
    url: input.url,
  }
  if (input.validThrough) node.validThrough = input.validThrough
  return node
}
