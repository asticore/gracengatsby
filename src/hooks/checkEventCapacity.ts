import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Prevents new RSVPs once an event's capacity has been reached.
 * Events with no capacity set are treated as unlimited.
 */
export const checkEventCapacity: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !data?.event) {
    return data
  }

  const eventID = typeof data.event === 'object' ? data.event.id : data.event

  const event = await req.payload.findByID({
    id: eventID,
    collection: 'events',
    req,
  })

  if (!event || typeof event.capacity !== 'number' || event.capacity <= 0) {
    return data
  }

  const existing = await req.payload.find({
    collection: 'event-rsvps',
    where: { event: { equals: eventID } },
    limit: 0,
    req,
  })

  const guestsSoFar = existing.docs.reduce(
    (sum, doc) => sum + (typeof doc.guestCount === 'number' ? doc.guestCount : 1),
    0,
  )
  const incomingGuests = typeof data.guestCount === 'number' ? data.guestCount : 1

  if (guestsSoFar + incomingGuests > event.capacity) {
    throw new Error(
      `Sorry, this event is at capacity. Only ${Math.max(event.capacity - guestsSoFar, 0)} spot(s) remaining.`,
    )
  }

  return data
}
