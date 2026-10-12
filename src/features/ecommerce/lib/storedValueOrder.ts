import type { StoredValuePlan } from './storedValue'

/**
 * Order-level helpers for stored value (pure). The plan itself is made by planStoredValue in ./storedValue.
 */

/**
 * Stripe cannot charge less than 50 cents. When stored value would leave a smaller (non-zero) amount for the card,
 * use less stored value so the card pays the minimum. Store credit is trimmed first, then gift cards from the last.
 */
export function enforceMinimumCard(plan: StoredValuePlan, totalCents: number, minCents = 50): StoredValuePlan {
  if (plan.payableCents <= 0 || plan.payableCents >= minCents) return plan
  let need = minCents - plan.payableCents
  let credit = plan.creditCents
  const cut = Math.min(need, credit)
  credit -= cut
  need -= cut
  const cards = plan.giftCards.map((c) => ({ ...c }))
  for (let i = cards.length - 1; i >= 0 && need > 0; i--) {
    const take = Math.min(need, cards[i].cents)
    cards[i].cents -= take
    need -= take
  }
  const kept = cards.filter((c) => c.cents > 0)
  const covered = kept.reduce((s, c) => s + c.cents, 0) + credit
  return { giftCards: kept, creditCents: credit, coveredCents: covered, payableCents: totalCents - covered }
}

/** What the card must pay for an order: the total less the stored value already applied to it. */
export function cardAmountOf(order: { amount?: number | null; giftCardTotal?: number | null; storeCreditTotal?: number | null }): number {
  return Math.max(0, (order.amount ?? 0) - (order.giftCardTotal ?? 0) - (order.storeCreditTotal ?? 0))
}

export type StoredValueSnapshot = {
  giftCards: { id: number; code: string; cents: number }[]
  creditUserId: number | null
  creditCents: number
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Reads the snapshot saved on an order. Anything malformed becomes an empty snapshot. */
export function parseSnapshot(value: unknown): StoredValueSnapshot {
  const v = (typeof value === 'string' ? safeJson(value) : value) as Partial<StoredValueSnapshot> | null
  const cards = Array.isArray(v?.giftCards) ? v.giftCards.filter((c) => c && Number.isInteger(c.id) && Number.isInteger(c.cents) && c.cents > 0) : []
  const credit = typeof v?.creditCents === 'number' && Number.isInteger(v.creditCents) && v.creditCents > 0 ? v.creditCents : 0
  return {
    giftCards: cards.map((c) => ({ id: Number(c.id), code: String(c.code ?? ''), cents: c.cents })),
    creditUserId: credit && Number.isInteger(v?.creditUserId) ? Number(v?.creditUserId) : null,
    creditCents: credit,
  }
}