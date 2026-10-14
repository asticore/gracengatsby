/**
 * Product recommendations ("customers also bought"). Pure, no I/O.
 *
 * Rule based, not AI: products that appear in the same paid orders as a product are suggested first, most
 * often bought together first. Products in the same category fill any gap. Nothing here reads a customer's name or email.
 */

export const RECOMMENDATION_WINDOW_DAYS = 180
export const RECOMMENDATION_MAX_ORDERS = 2000
export const RECOMMENDATION_DEFAULT_MAX = 4
export const RECOMMENDATION_MAX_CAP = 12

export type CoPurchaseCounts = Map<number, Map<number, number>>
export type RecommendationCandidate = { published: boolean; inStock: boolean }

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

/** Clamps the shop's "most to show" setting to 1 to 12; anything unreadable is the default of 4. */
export function recommendationMaxFrom(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN
  if (!Number.isFinite(n)) return RECOMMENDATION_DEFAULT_MAX
  return Math.min(RECOMMENDATION_MAX_CAP, Math.max(1, n))
}

/**
 * How often each pair of products was bought in the same order. `baskets` holds the product ids of each
 * paid order; a product counts once per order, so a quantity of 3 is still one purchase.
 */
export function coPurchaseCounts(baskets: unknown[][]): CoPurchaseCounts {
  const counts: CoPurchaseCounts = new Map()
  for (const basket of baskets) {
    const ids = [...new Set(basket.filter(isId))]
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue
        const row = counts.get(a) ?? new Map<number, number>()
        row.set(b, (row.get(b) ?? 0) + 1)
        counts.set(a, row)
      }
    }
  }
  return counts
}

/** Merges the co-purchase rows of several products into one score per product (sum of how often they went together). */
export function scoreFor(anchorIds: number[], counts: CoPurchaseCounts): Map<number, number> {
  const score = new Map<number, number>()
  for (const anchor of anchorIds) {
    for (const [id, n] of counts.get(anchor) ?? new Map<number, number>()) score.set(id, (score.get(id) ?? 0) + n)
  }
  return score
}

/**
 * The ids to suggest, at most `limit`. Order: bought together (highest score first, then lower id), then
 * same-category products in the order given. Never suggests a product already being looked at, a product
 * that is not published, or one that is out of stock.
 */
export function pickRecommendations(input: {
  anchorIds: number[]
  counts: CoPurchaseCounts
  categoryPeerIds: number[]
  candidates: Map<number, RecommendationCandidate>
  limit: number
}): number[] {
  const limit = Math.max(0, Math.floor(input.limit))
  const anchors = new Set(input.anchorIds)
  const score = scoreFor(input.anchorIds, input.counts)
  const together = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id)
  const ordered = [...together, ...input.categoryPeerIds]
  const picked: number[] = []
  const seen = new Set<number>()
  for (const id of ordered) {
    if (picked.length >= limit) break
    if (anchors.has(id) || seen.has(id)) continue
    seen.add(id)
    const candidate = input.candidates.get(id)
    if (!candidate || !candidate.published || !candidate.inStock) continue
    picked.push(id)
  }
  return picked
}
