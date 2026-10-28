import { getEngine } from '@/lib/engine'
import { priceInfo } from '@/features/ecommerce/pricing'
import { countWords } from '@/features/editScreens/readingTime'
import { parseTiers } from '@/features/editScreens/tiers'

import { eventNodes, type FaqItem } from './schemaNodes'

/**
 * Server-side reads that feed the structured data for one page: FAQ blocks,
 * article facts and event details. The pure rules live in schemaNodes.ts.
 */

type Raw = Record<string, unknown>

const MAX_FAQ_ITEMS = 50
const MAX_CATEGORY_FAQS = 100

const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const trimmed = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const present = <T>(value: T | null): value is T => value !== null

/** The author's display name only. An email is never published. */
export function authorNameOf(author: unknown): string | undefined {
  if (!isRecord(author)) return undefined
  return trimmed(author.name) || undefined
}

/** Article facts: word count, first category, focus keyphrase as keywords, and language. */
export function articleFacts(doc: Raw, locale = 'en'): { wordCount?: number; articleSection?: string; keywords?: string; inLanguage: string } {
  const categories = listOf(doc.categories).filter(isRecord)
  const seo = isRecord(doc.seo) ? doc.seo : {}
  const words = countWords(doc.content, doc.layout)
  return {
    wordCount: words || undefined,
    articleSection: trimmed(categories[0]?.name) || undefined,
    keywords: trimmed(seo.focusKeyphrase) || undefined,
    // The page's language: the request locale when multilingual is on, else the root layout's "en".
    inLanguage: locale,
  }
}

const faqFromRecord = (value: unknown): FaqItem | null => {
  if (!isRecord(value)) return null
  const question = trimmed(value.question)
  return question ? { question, answer: value.answer } : null
}

/** FAQ entries from the page's FAQ blocks, in block order: by category, or hand-picked. */
export async function loadFaqItems(doc: Raw): Promise<FaqItem[]> {
  const blocks = [...listOf(doc.blocks), ...listOf(doc.layout)].filter(
    (block): block is Raw => isRecord(block) && block.blockType === 'faq',
  )
  if (blocks.length === 0) return []

  const engine = await getEngine()
  const found: FaqItem[] = []
  for (const block of blocks) {
    if (block.source === 'manual') {
      const entries = listOf(block.faqs)
      found.push(...entries.map(faqFromRecord).filter(present))
      const ids = entries.filter((entry): entry is number | string => typeof entry === 'number' || typeof entry === 'string')
      if (ids.length > 0) {
        const { docs } = (await engine.find({ collection: 'faqs', where: { id: { in: ids } }, limit: ids.length, depth: 0 })) as unknown as { docs: Raw[] }
        found.push(...docs.map(faqFromRecord).filter(present))
      }
    } else {
      const category = trimmed(block.category)
      const { docs } = (await engine.find({
        collection: 'faqs',
        ...(category ? { where: { category: { equals: category } } } : {}),
        limit: MAX_CATEGORY_FAQS,
        depth: 0,
      })) as unknown as { docs: Raw[] }
      found.push(...docs.map(faqFromRecord).filter(present))
    }
  }

  const seen = new Set<string>()
  const unique = found.filter((item) => {
    const key = item.question.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return unique.slice(0, MAX_FAQ_ITEMS)
}

/** Location, status, organizer and offers for an event. Used only for the events collection. */
export function eventExtraFor(doc: Raw, url: string, organizerName: string): Raw {
  const location = isRecord(doc.location) ? doc.location : {}
  const paid = doc.eventType === 'paid' && isRecord(doc.ticketProduct)
  const ticketPrice = paid ? priceInfo(doc.ticketProduct as Parameters<typeof priceInfo>[0]).price : null
  return eventNodes({
    url,
    isOnline: location.isOnline === true,
    venueName: trimmed(location.venueName),
    address: trimmed(location.address),
    organizerName,
    tiers: parseTiers(doc.ticketTiers),
    ticketPrice,
  })
}
