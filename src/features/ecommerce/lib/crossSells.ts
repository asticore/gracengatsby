/**
 * Cross-sell picker for the cart. Pure, no I/O.
 *
 * Each product can list "cross-sells" (Linked products). For the products in the cart, in cart
 * order, this takes their suggestions in their own order and keeps up to `limit` distinct ones
 * that are published, in stock and not already in the cart.
 */

export const CROSS_SELL_LIMIT = 4

export type CrossSellCandidate = { id: number; published: boolean; inStock: boolean }

export type CrossSellSource = { productId: number; crossSellIds: number[] }

/** One product card in the cart suggestions. `price` is in whole shop currency units, like `priceInAUD`. */
export type CrossSellCard = {
  id: number
  title: string
  slug: string | null
  price: number | null
  image: string | null
}

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

/** Product id from a cart item's `product` (a bare id or a populated product object). */
export function productIdOf(value: unknown): number | null {
  if (isId(value)) return value
  if (value && typeof value === 'object' && 'id' in value && isId((value as { id: unknown }).id)) return (value as { id: number }).id
  return null
}

/** Distinct product ids in the cart, in cart order. */
export function cartProductIds(items: Array<{ product?: unknown }> | null | undefined): number[] {
  const ids: number[] = []
  for (const item of items ?? []) {
    const id = productIdOf(item?.product)
    if (id !== null && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Returns the ids to suggest, at most `limit`. `sources` must already be in cart order.
 * Stable: the same input always gives the same output, and earlier cart lines win.
 */
export function pickCrossSells(input: { cartProductIds: number[]; sources: CrossSellSource[]; candidates: CrossSellCandidate[]; limit?: number }): number[] {
  const limit = Math.max(0, Math.floor(input.limit ?? CROSS_SELL_LIMIT))
  const inCart = new Set(input.cartProductIds)
  const byId = new Map(input.candidates.map((candidate) => [candidate.id, candidate]))
  const picked: number[] = []
  const seen = new Set<number>()
  for (const source of input.sources) {
    for (const id of source.crossSellIds) {
      if (picked.length >= limit) return picked
      if (seen.has(id) || inCart.has(id)) continue
      seen.add(id)
      const candidate = byId.get(id)
      if (!candidate || !candidate.published || !candidate.inStock) continue
      picked.push(id)
    }
  }
  return picked
}