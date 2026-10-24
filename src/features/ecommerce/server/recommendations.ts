import { priceInfo } from '../pricing'
import { excludeProtected } from '@/features/visibility/excludeProtected'
import { computeStockStatus } from '../stock'
import { coPurchaseCounts, pickRecommendations, recommendationMaxFrom, RECOMMENDATION_MAX_ORDERS, RECOMMENDATION_WINDOW_DAYS, scoreFor, type CoPurchaseCounts, type RecommendationCandidate } from '../lib/recommendations'
import type { CrossSellCard } from '../lib/crossSells'

type Doc = Record<string, unknown> & { id: number; _status?: string | null }
export type RecommendEngine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findGlobal: (a: unknown) => Promise<Record<string, unknown> | null>
}

/** Orders that count as bought: paid and not cancelled or refunded. */
const COUNTED_STATUSES = ['processing', 'on-hold', 'completed']
const CACHE_TTL_MS = 10 * 60_000
const CANDIDATE_LIMIT = 200

let cache: { at: number; counts: CoPurchaseCounts } | null = null

/** Empties the co-purchase cache (used when a shop setting changes and in tests). */
export const clearRecommendationCache = (): void => {
  cache = null
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

/** The switch and the "most to show" number from the shop-extra-settings global. Off by default. */
export async function loadRecommendationSettings(engine: RecommendEngine): Promise<{ enabled: boolean; max: number }> {
  const doc = (await engine.findGlobal({ slug: 'shop-extra-settings', depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
  return { enabled: doc?.recommendationsEnabled === true, max: recommendationMaxFrom(doc?.recommendationsMax) }
}

/**
 * Which products were bought together, from paid orders in the last 180 days (the newest 2000 orders).
 * Cached for ten minutes per worker. A failed read gives an empty table, so the storefront falls back to categories.
 */
export async function loadCoPurchaseCounts(engine: RecommendEngine, now: Date = new Date()): Promise<CoPurchaseCounts> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.counts
  const since = new Date(now.getTime() - RECOMMENDATION_WINDOW_DAYS * 86_400_000).toISOString()
  const { docs } = (await engine
    .find({
      collection: 'orders',
      where: { and: [{ status: { in: COUNTED_STATUSES } }, { createdAt: { greater_than: since } }] },
      sort: '-createdAt',
      limit: RECOMMENDATION_MAX_ORDERS,
      depth: 0,
      overrideAccess: true,
    })
    .catch((): { docs: Doc[] } => ({ docs: [] }))) as { docs: Doc[] }
  const baskets = docs.map((order) => (Array.isArray(order.lineItems) ? order.lineItems : []).map((line) => idOf((line as { productId?: unknown })?.productId)))
  const counts = coPurchaseCounts(baskets)
  cache = { at: Date.now(), counts }
  return counts
}

/** Only products a customer can add to a cart on their own: simple and variable products. */
const shoppable = (doc: Doc): boolean => {
  const type = (doc as { productType?: string | null }).productType ?? 'simple'
  return type === 'simple' || type === 'variable'
}

/**
 * Products to suggest next to `anchorIds` (the product being viewed, or the products in the cart).
 * Returns full product docs (depth 1), published and in stock, at most `limit`. Empty when there is nothing to base them on.
 */
export async function recommendedProducts(engine: RecommendEngine, input: { anchorIds: number[]; categories: string[]; limit: number; now?: Date }): Promise<Doc[]> {
  const anchorIds = [...new Set(input.anchorIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (anchorIds.length === 0 && input.categories.length === 0) return []
  const counts = await loadCoPurchaseCounts(engine, input.now)
  const peerWhere = [{ _status: { equals: 'published' } }, { category: { in: input.categories } }, ...(anchorIds.length ? [{ id: { not_in: anchorIds } }] : [])]
  const { docs: peers } = input.categories.length
    ? ((await engine
        .find({ collection: 'products', where: { and: peerWhere }, limit: 60, depth: 0, overrideAccess: true })
        .catch((): { docs: Doc[] } => ({ docs: [] }))) as { docs: Doc[] })
    : { docs: [] as Doc[] }
  const togetherIds = [...scoreFor(anchorIds, counts).keys()].slice(0, 60)
  const wanted = [...new Set([...togetherIds, ...peers.map((doc) => doc.id)])].slice(0, CANDIDATE_LIMIT)
  if (wanted.length === 0) return []
  const { docs: found } = (await engine
    .find({ collection: 'products', where: { and: [{ _status: { equals: 'published' } }, { id: { in: wanted } }] }, limit: CANDIDATE_LIMIT, depth: 1, overrideAccess: true })
    .catch((): { docs: Doc[] } => ({ docs: [] }))) as { docs: Doc[] }
  const docs = await excludeProtected('products', found)
  const byId = new Map(docs.map((doc) => [doc.id, doc]))
  const candidates = new Map<number, RecommendationCandidate>(
    docs.filter(shoppable).map((doc) => [doc.id, { published: doc._status === 'published', inStock: computeStockStatus(doc as never) !== 'outofstock' }]),
  )
  const ids = pickRecommendations({ anchorIds, counts, categoryPeerIds: peers.map((doc) => doc.id), candidates, limit: input.limit })
  return ids.map((id) => byId.get(id)).filter((doc): doc is Doc => Boolean(doc))
}

/** A product card for the cart's suggestions (public fields only). `price` is whole shop currency units, like priceInAUD. */
export function recommendationCard(doc: Doc): CrossSellCard {
  const first = Array.isArray(doc.images) ? doc.images[0] : null
  const image = first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string' ? (first as { url: string }).url : null
  const info = priceInfo(doc as never)
  return { id: doc.id, title: String(doc.title ?? ''), slug: typeof doc.slug === 'string' ? doc.slug : null, price: info.price ?? (typeof doc.priceInAUD === 'number' ? doc.priceInAUD : null), image }
}

/** Ids from a cart's product list (bare ids or populated products), in cart order. */
export const recommendationAnchors = (values: unknown[]): number[] => [...new Set(values.map(idOf).filter((id): id is number => id !== null))]
