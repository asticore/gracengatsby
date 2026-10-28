/**
 * Ticket tiers on an event. Stored as JSON on the event (an array of tiers),
 * so no extra tables are needed. Everything read from storage or from a
 * request goes through parseTiers, which keeps only well-formed tiers.
 */

export type TicketTier = {
  /**
   * Stable key for translations (`ticketTiers.<id>.name`). Assigned on save by
   * `withTierIds`; a tier saved before that has none and is not translated yet.
   */
  id?: string
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

const TIER_ID = /^[A-Za-z0-9_-]{1,40}$/

/** Gives every tier without an id a new one. Existing ids are kept, so translations survive edits and reorders. */
export function withTierIds(value: unknown, makeId: () => string): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry
    const e = entry as Record<string, unknown>
    if (typeof e.id === 'string' && TIER_ID.test(e.id)) return entry
    return { ...e, id: makeId() }
  })
}

/** `ticketTiers.<id>.name` or `.description`: the translatable text of one tier. */
const TIER_PATH = /^ticketTiers\.([A-Za-z0-9_-]{1,40})\.(name|description)$/

export function parseTierPath(path: string): { id: string; field: 'name' | 'description' } | null {
  const match = TIER_PATH.exec(path)
  return match ? { id: match[1], field: match[2] as 'name' | 'description' } : null
}

export const tierPath = (id: string, field: 'name' | 'description'): string => `ticketTiers.${id}.${field}`

export function readTierText(value: unknown, id: string, field: 'name' | 'description'): string | undefined {
  const tier = Array.isArray(value) ? value.find((t) => (t as TicketTier)?.id === id) : undefined
  const text = tier ? (tier as Record<string, unknown>)[field] : undefined
  return typeof text === 'string' ? text : undefined
}

/** Copy-on-write: only the matching tier is replaced. A tier that is not found leaves the array unchanged. */
export function writeTierText(value: unknown, id: string, field: 'name' | 'description', text: string): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => ((entry as TicketTier)?.id === id ? { ...(entry as object), [field]: text } : entry))
}

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
    const id = typeof e.id === 'string' && TIER_ID.test(e.id) ? e.id : undefined
    tiers.push({
      ...(id ? { id } : {}),
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

/** beforeChange for events: assigns ids to tiers that do not have one yet. */
export const tierIdsBeforeChange = async (args: unknown): Promise<unknown> => {
  const data = (args as { data?: Record<string, unknown> }).data
  if (!data || !Array.isArray(data.ticketTiers)) return data
  return { ...data, ticketTiers: withTierIds(data.ticketTiers, () => globalThis.crypto.randomUUID().slice(0, 12)) }
}
