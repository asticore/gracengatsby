import type { Payload } from '@/engine'
import type { EventRsvp } from '@/engage-types'

import type { AccountUser } from './session'
import { RSVPS_SLUG } from './types'

/**
 * The signed-in customer's event bookings.
 *
 * Access-enforced, like orders and addresses: `overrideAccess: false` plus the
 * session user means the collection's own owner rule decides which rows come
 * back. The address in the `where` clause is taken from the session, never
 * from the request, and is there as a second lock rather than the only one -
 * if the collection's rule were ever loosened, this query would still not
 * return somebody else's booking.
 */
export type Booking = EventRsvp & {
  eventTitle: string
  eventDate: string | null
  eventSlug: string | null
}

type EventLike = { title?: string | null; startDate?: string | null; date?: string | null; slug?: string | null }

export const bookingsForCustomer = async (
  engine: Payload,
  user: AccountUser,
): Promise<Booking[]> => {
  const email = typeof user.email === 'string' ? user.email : ''
  if (!email) return []

  const { docs } = await engine
    .find({
      collection: RSVPS_SLUG,
      where: { email: { equals: email } },
      sort: '-createdAt',
      limit: 100,
      depth: 1,
      overrideAccess: false,
      user,
    })
    .catch(() => ({ docs: [] as EventRsvp[] }))

  return (docs as EventRsvp[]).map((rsvp) => {
    const event = (rsvp.event && typeof rsvp.event === 'object' ? rsvp.event : {}) as EventLike
    return {
      ...rsvp,
      eventTitle: event.title || 'Event',
      eventDate: event.startDate || event.date || null,
      eventSlug: event.slug || null,
    }
  })
}
