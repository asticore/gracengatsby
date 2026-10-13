/**
 * Ticket type sales for an event: how many places each type has taken, what is left,
 * and whether it is sold out. Pure, so the event page, the RSVP guard and the tests
 * share one count. Guests count one place each, as on the RSVP itself.
 */

import { tierOnSale, tierPriceLabel, type TicketTier } from './tiers'

export type TierView = {
  name: string
  description: string
  price: number
  priceLabel: string
  /** Places left; null when the type has no limit. */
  remaining: number | null
  onSale: boolean
  soldOut: boolean
}

/** The slice of an RSVP the count reads. */
export type TierSaleRow = { ticketTier?: unknown; guestCount?: unknown }

/** Guests booked per ticket type name. Rows with no type count for nothing here. */
export function guestsByTier(rows: TierSaleRow[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.ticketTier !== 'string' || row.ticketTier === '') continue
    const guests = Number(row.guestCount)
    const count = Number.isFinite(guests) && guests > 0 ? guests : 1
    totals.set(row.ticketTier, (totals.get(row.ticketTier) ?? 0) + count)
  }
  return totals
}

/** Each type with its remaining places and sold-out state. */
export function tierViews(tiers: TicketTier[], rows: TierSaleRow[], now = new Date()): TierView[] {
  const booked = guestsByTier(rows)
  return tiers.map((tier) => {
    const onSale = tierOnSale(tier, now)
    const remaining = tier.capacity === null ? null : Math.max(tier.capacity - (booked.get(tier.name) ?? 0), 0)
    return {
      name: tier.name,
      description: tier.description,
      price: tier.price,
      priceLabel: tierPriceLabel(tier),
      remaining,
      onSale,
      soldOut: !onSale || remaining === 0,
    }
  })
}

/**
 * Why `guests` more places cannot be booked on a type, or null when there is room.
 * `bookedGuests` is what the type already has.
 */
export function tierRoomError(tier: TicketTier, bookedGuests: number, guests: number, now = new Date()): string | null {
  if (!tierOnSale(tier, now)) return `${tier.name} is no longer on sale.`
  if (tier.capacity === null) return null
  const left = Math.max(tier.capacity - bookedGuests, 0)
  if (left === 0) return `Sorry, ${tier.name} is sold out.`
  if (guests > left) return `Sorry, only ${left} ${left === 1 ? 'place is' : 'places are'} left on ${tier.name}.`
  return null
}

/** One line for the RSVP ticket type list, e.g. "VIP - $25.00 - 4 left". */
export function tierOptionLabel(view: TierView): string {
  const sales = view.remaining === null ? '' : view.soldOut ? ' - sold out' : ` - ${view.remaining} left`
  return `${view.name} - ${view.priceLabel}${sales}`
}
