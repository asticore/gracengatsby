/**
 * Ticket tiers on an event. Stored as JSON on the event (an array of tiers),
 * so no extra tables are needed. Everything read from storage or from a
 * request goes through parseTiers, which keeps only well-formed tiers.
 */

export type TicketTier = {
  name: string
  description: string
  /** Dollars. 0 is free. */
  price: number
  /** Places on this tier; null for no limit. */
  capacity: number | null
  /** ISO date after which the tier is no longer sold; null to sell until the event. */
  salesEnd: string | null
}

export const MAX_TIERS = 20

const num = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Tiers from a stored value (array, JSON string or anything else). Bad entries are dropped. */
export function parseTiers(value: unknown): TicketTier[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  const tiers: TicketTier[] = []
  for (const entry of raw.slice(0, MAX_TIERS)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const name = typeof e.name === 'string' ? e.name.trim().slice(0, 80) : ''
    if (!name) continue
    const salesEnd = typeof e.salesEnd === 'string' && !Number.isNaN(new Date(e.salesEnd).getTime()) ? e.salesEnd : null
    tiers.push({
      name,
      description: typeof e.description === 'string' ? e.description.slice(0, 300) : '',
      price: num(e.price) ?? 0,
      capacity: num(e.capacity),
      salesEnd,
    })
  }
  return tiers
}

/** A tier is on sale until its stop date (end of that day) has passed. */
export function tierOnSale(tier: TicketTier, now = new Date()): boolean {
  if (!tier.salesEnd) return true
  return new Date(tier.salesEnd).getTime() >= now.getTime()
}

/** "Free" or "$25.00". */
export function tierPriceLabel(tier: TicketTier): string {
  return tier.price > 0 ? `$${tier.price.toFixed(2)}` : 'Free'
}
