/**
 * Pure helpers for per-product quantity limits (min/max per order) and "name your price" amounts.
 * No I/O, so the storefront UI and the server (catalogue.ts) can share one set of rules.
 * Money here is integer cents; the product fields hold whole dollars (see PriceInput).
 */

export type QtyLimits = { minQty?: number | null; maxQty?: number | null; stockQty?: number | null }

/** Highest amount a buyer may type into a name-your-price box (cents). Keeps absurd values out. */
export const MAX_NAMED_CENTS = 10_000_000

/**
 * Brings a requested quantity inside the allowed range. Never returns less than 1, and the
 * upper bound is the smallest of maxQty and stockQty when those are set. If the limits contradict
 * each other (for example stock below the minimum), the minimum wins and the server's stock check
 * still refuses the order.
 */
export function clampQuantity(qty: number, { minQty, maxQty, stockQty }: QtyLimits): number {
  const low = Math.max(1, Number.isFinite(minQty) && minQty != null ? Math.floor(minQty) : 1)
  const capValues = [maxQty, stockQty].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const high = capValues.length > 0 ? Math.floor(Math.min(...capValues)) : Number.POSITIVE_INFINITY
  const wanted = Number.isFinite(qty) ? Math.trunc(qty) : low
  return Math.min(Math.max(wanted, low), Math.max(high, low))
}

/** Plain-English reason a line quantity breaks the product's limits, or null when it is fine. */
export function quantityError(qty: number, { minQty, maxQty }: Pick<QtyLimits, 'minQty' | 'maxQty'>, inCart = qty): string | null {
  if (typeof minQty === 'number' && qty < minQty) return `You need to order at least ${minQty} of this product.`
  if (typeof maxQty === 'number' && inCart > maxQty) return `You can order at most ${maxQty} of this product at a time.`
  return null
}

export type NamedPriceResult = { ok: boolean; error: string | null; cents: number | null }

/**
 * Checks a buyer's "pay what you want" amount in cents. `minPrice` is the shop's minimum in cents;
 * a missing minimum still means at least one cent.
 */
export function validateNamedPrice(cents: unknown, { minPrice }: { minPrice?: number | null } = {}): NamedPriceResult {
  const fail = (error: string): NamedPriceResult => ({ ok: false, error, cents: null })
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) return fail('Please enter the amount you want to pay, in dollars and cents.')
  const floor = Math.max(1, Number.isSafeInteger(minPrice) && minPrice != null ? minPrice : 1)
  if (cents < floor) return fail(`Please enter at least $${(floor / 100).toFixed(2)}.`)
  if (cents > MAX_NAMED_CENTS) return fail(`Please enter no more than $${(MAX_NAMED_CENTS / 100).toFixed(2)}.`)
  return { ok: true, error: null, cents }
}