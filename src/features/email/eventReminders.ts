import { eventsDueForReminder, formatWhen, rsvpNeedsReminder, type EventLike, type RsvpLike } from './schedule'

/**
 * Sends the event reminder to each guest of an event that starts soon.
 *
 * Once per RSVP: the reminder time is written on the RSVP before the email goes,
 * the same order the membership reminder uses, so a provider failure is not
 * retried on the next tick. A failed reminder shows in the email log. If the
 * reminder time cannot be written, the email is not sent at all.
 *
 * Called from scheduledEmails.ts on each cron tick. Quiet hours are checked there.
 */

type Doc = Record<string, unknown>

export type ReaderEngine = {
  find(args: {
    collection: string
    where?: Record<string, unknown>
    limit?: number
    depth?: number
    overrideAccess?: boolean
  }): Promise<{ docs: unknown[] }>
  update(args: {
    collection: string
    id: number | string
    data: Record<string, unknown>
    overrideAccess?: boolean
  }): Promise<unknown>
}

export type EventReminderSweep = { events: number; sent: number; skipped: number }

const EVENT_LIMIT = 200
const RSVP_LIMIT = 500

export async function sendEventReminders(
  engine: ReaderEngine,
  options: { hoursBefore: number; timeZone: string; now?: Date },
): Promise<EventReminderSweep> {
  const now = options.now ?? new Date()
  const sweep: EventReminderSweep = { events: 0, sent: 0, skipped: 0 }

  const horizon = new Date(now.getTime() + options.hoursBefore * 60 * 60 * 1000)
  const { docs } = await engine
    .find({
      collection: 'events',
      where: {
        and: [{ startDate: { greater_than: now.toISOString() } }, { startDate: { less_than_equal: horizon.toISOString() } }],
      },
      depth: 0,
      limit: EVENT_LIMIT,
      overrideAccess: true,
    })
    .catch((): { docs: unknown[] } => ({ docs: [] }))

  const events = eventsDueForReminder(docs as (EventLike & Doc)[], now, options.hoursBefore)
  sweep.events = events.length

  const { sendEmail } = await import('@/features/email')
  const { renderEmailTemplate } = await import('@/features/email/templateLoad')

  for (const event of events) {
    const { docs: rsvps } = await engine
      .find({
        collection: 'event-rsvps',
        where: { event: { equals: event.id } },
        depth: 0,
        limit: RSVP_LIMIT,
        overrideAccess: true,
      })
      .catch((): { docs: unknown[] } => ({ docs: [] }))

    for (const rsvp of rsvps as (RsvpLike & Doc)[]) {
      if (!rsvpNeedsReminder(rsvp)) {
        sweep.skipped += 1
        continue
      }

      try {
        await engine.update({
          collection: 'event-rsvps',
          id: rsvp.id,
          data: { reminderSentAt: now.toISOString() },
          overrideAccess: true,
        })
      } catch {
        sweep.skipped += 1
        continue
      }

      const when = formatWhen(event.startDate, options.timeZone)
      const mail = await renderEmailTemplate('eventReminder', {
        name: typeof rsvp.name === 'string' ? rsvp.name : '',
        eventTitle: typeof event.title === 'string' ? event.title : '',
        when,
        eventDate: when,
        guestCount: typeof rsvp.guestCount === 'number' ? rsvp.guestCount : 1,
      })

      const result = await sendEmail({
        to: String(rsvp.email).trim(),
        template: 'event.reminder',
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      })
      if (result.ok) sweep.sent += 1
      else sweep.skipped += 1
    }
  }

  return sweep
}
