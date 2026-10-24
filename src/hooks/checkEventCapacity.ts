import type { CollectionBeforeChangeHook } from '@/engine'

/**
 * Prevents new RSVPs once an event's capacity has been reached.
 * Events with no capacity set are treated as unlimited.
 */
export const checkEventCapacity: CollectionBeforeChangeHook = async ({ data, req, operation }) => {
  if (operation !== 'create' || !data?.event) {
    return data
  }

  const eventID = typeof data.event === 'object' ? data.event.id : data.event

  // A password-protected event takes RSVPs only from a visitor who has unlocked it (fails closed).
  // Lazy import: gate -> connect -> schema is built from the collections, which import this file.
  const { getPasswordGateStateForHeaders } = await import('@/features/visibility/gate')
  const isAdminUser = Boolean((req as { user?: { roles?: string[] | null } | null }).user?.roles?.includes('admin'))
  const gate = isAdminUser
    ? 'open'
    : await getPasswordGateStateForHeaders({
        collection: 'events',
        id: Number(eventID),
        headers: (req as { headers?: Headers }).headers,
      })
  if (gate === 'locked') {
    throw new Error('This event is password protected.')
  }

  const event = await req.engine.findByID({
    id: eventID,
    collection: 'events',
    req,
  })

  if (!event || typeof event.capacity !== 'number' || event.capacity <= 0) {
    return data
  }

  const existing = await req.engine.find({
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
