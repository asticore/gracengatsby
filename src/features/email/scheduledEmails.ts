import { getMemberSettings } from '@/features/members/settings'
import { sendExpiryReminders } from '@/features/members/emails'
import { normalizeSiteDetails } from '@/features/site/detailsModel'

import { sendEventReminders, type ReaderEngine } from './eventReminders'
import { eventHoursFrom, isTemplateEnabled, quietHoursHold, renewalDaysFrom, SCHEDULE_GLOBAL_SLUG, type EmailScheduleDoc } from './schedule'

/**
 * The scheduled (reminder) emails, run from the cron on each tick. The one entry
 * point the cron route calls.
 *
 * - Quiet hours hold everything here for the whole tick. Reminders wait and go
 *   out on the first tick after quiet hours end. Transactional mail is never
 *   routed through here.
 * - Membership renewal reminders run once an hour (the minute check below), the
 *   same cadence the other housekeeping uses. The reminder itself is idempotent
 *   per membership and renewal date (expiryReminderSentAt), so a repeat run
 *   sends nothing new.
 * - Event reminders run on every tick. Each RSVP is reminded once (reminderSentAt).
 *
 * Never throws. Each part is independent, so one failure does not stop the other.
 */

export type ScheduledEmailsResult = { held: boolean; membership: boolean; events: number }

export async function runScheduledEmails(engine: ReaderEngine & { findGlobal: (args: never) => Promise<unknown> }, now: Date = new Date()): Promise<ScheduledEmailsResult> {
  const result: ScheduledEmailsResult = { held: false, membership: false, events: 0 }

  const schedule = (await engine
    .findGlobal({ slug: SCHEDULE_GLOBAL_SLUG, depth: 0 } as never)
    .catch((): null => null)) as EmailScheduleDoc | null
  const site = (await engine.findGlobal({ slug: 'site-details', depth: 0 } as never).catch((): null => null)) as unknown
  const timeZone = normalizeSiteDetails(site).timezone

  if (quietHoursHold(schedule, now, timeZone)) {
    result.held = true
    return result
  }

  if (isTemplateEnabled(schedule, 'membershipRenewal') && now.getUTCMinutes() < 5) {
    try {
      const memberSettings = await getMemberSettings(engine as never)
      const days = renewalDaysFrom(schedule, memberSettings.emails.expiryReminderDays)
      await sendExpiryReminders(
        engine as never,
        { ...memberSettings, emails: { ...memberSettings.emails, expiryReminderDays: days } },
        now,
      )
      result.membership = true
    } catch (error) {
      console.error('scheduled email (membership renewal) error:', error)
    }
  }

  if (isTemplateEnabled(schedule, 'eventReminder')) {
    try {
      const sweep = await sendEventReminders(engine, { hoursBefore: eventHoursFrom(schedule), timeZone, now })
      result.events = sweep.sent
    } catch (error) {
      console.error('scheduled email (event reminder) error:', error)
    }
  }

  return result
}
