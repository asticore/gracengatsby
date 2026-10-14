import type { CollectionAfterChangeHook } from '@/engine'
import { EVENT_TIME_ZONE } from '@/features/editScreens/timeZone'

/**
 * The booking confirmation sent after a guest RSVPs with an email address.
 *
 * Runs as an afterChange hook on event-rsvps, so it covers the public RSVP form
 * and any RSVP created by hand in the admin. The Email feature and the template
 * loader are imported when the hook runs, not at load time, because they reach
 * for the engine and this file is imported by the collection config.
 *
 * Never fails the booking: the RSVP is already saved when this runs, so any
 * problem here is swallowed rather than returned to the guest.
 */

type RsvpRecord = { event?: unknown; name?: unknown; email?: unknown; guestCount?: unknown }

/** The event's start, read as an Australian reader expects it, in the event's own time zone. */
const whenText = (value: unknown): string => {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-AU', {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const rsvpConfirmationAfterChange: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  try {
    if (operation !== 'create') return doc

    const rsvp = doc as RsvpRecord
    const to = typeof rsvp.email === 'string' ? rsvp.email.trim() : ''
    if (!to) return doc

    const reference = typeof rsvp.event === 'object' && rsvp.event !== null ? (rsvp.event as { id?: unknown }).id : rsvp.event
    const eventId = Number(reference)
    if (!Number.isInteger(eventId)) return doc

    const event = (await req.engine.findByID({ id: eventId, collection: 'events', req })) as
      | { title?: unknown; startDate?: unknown }
      | null
    if (!event) return doc

    const { renderEmailTemplate } = await import('@/features/email/templateLoad')
    const mail = await renderEmailTemplate('rsvpConfirmation', {
      name: typeof rsvp.name === 'string' ? rsvp.name : '',
      eventTitle: typeof event.title === 'string' ? event.title : '',
      eventDate: whenText(event.startDate),
      guestCount: typeof rsvp.guestCount === 'number' ? rsvp.guestCount : 1,
    })

    const { sendEmail } = await import('@/features/email')
    await sendEmail({ to, subject: mail.subject, text: mail.text, html: mail.html })
  } catch {
    // The booking is saved already; a failed confirmation must not reach the guest.
  }
  return doc
}
