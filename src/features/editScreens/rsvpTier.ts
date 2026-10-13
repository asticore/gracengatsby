import type { CollectionBeforeChangeHook } from '@/engine'

import { parseTiers } from './tiers'
import { guestsByTier, tierRoomError } from './tierSales'

/**
 * Ticket type rules for a new RSVP. An event with ticket types needs one chosen, it must be
 * one of the event's types, and the guests must fit in what that type has left. An event with
 * no types keeps no type on the RSVP. Counts read every RSVP, so a visitor who cannot read the
 * list still sees the true number.
 */
export const checkRsvpTier: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !data?.event) {
    return data
  }

  const eventID = typeof data.event === 'object' ? data.event.id : data.event
  const event = await req.engine.findByID({
    id: eventID,
    collection: 'events',
    req,
    overrideAccess: true,
  })

  const tiers = parseTiers(event?.ticketTiers)
  if (tiers.length === 0) {
    data.ticketTier = null
    return data
  }

  const chosen = typeof data.ticketTier === 'string' ? data.ticketTier.trim() : ''
  if (!chosen) {
    throw new Error('Choose a ticket type.')
  }
  const tier = tiers.find((candidate) => candidate.name === chosen)
  if (!tier) {
    throw new Error('That ticket type is not available for this event.')
  }

  const existing = await req.engine.find({
    collection: 'event-rsvps',
    where: { event: { equals: eventID } },
    limit: 0,
    req,
    overrideAccess: true,
  })
  const booked = guestsByTier(existing.docs as Array<{ ticketTier?: unknown; guestCount?: unknown }>).get(tier.name) ?? 0
  const incoming = typeof data.guestCount === 'number' ? data.guestCount : 1

  const problem = tierRoomError(tier, booked, incoming)
  if (problem) {
    throw new Error(problem)
  }

  data.ticketTier = tier.name
  return data
}