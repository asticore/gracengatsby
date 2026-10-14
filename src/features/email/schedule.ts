import { wallTimeIn } from '@/features/editScreens/timeZone'

/**
 * When each automatic email is sent: the switches and timing held in the
 * `email-schedule` global (src/globals/EmailSchedule.ts). Pure - no engine, no
 * database - so the rules can be tested on their own.
 *
 * Each email in the log carries a template key such as 'member.renewal'. The
 * key maps to one switch here. sendEmail (index.ts) holds a send whose switch is
 * off, and the reminder runner (scheduledEmails.ts) uses the timing and quiet
 * hours before it picks anyone.
 */

export const SCHEDULE_GLOBAL_SLUG = 'email-schedule'

export const SCHEDULE_KEYS = [
  'accountWelcome',
  'accountReset',
  'accountAlreadyRegistered',
  'membershipRenewal',
  'rsvpConfirmation',
  'eventReminder',
  'approvalSubmitted',
  'approvalDecision',
  'backInStock',
  'lowStockAlert',
] as const

export type ScheduleKey = (typeof SCHEDULE_KEYS)[number]

type Switch = { enabled?: boolean | null } | null | undefined

/** The `email-schedule` global as stored. A missing row or value means the default for that switch. */
export type EmailScheduleDoc = {
  accountWelcome?: Switch
  accountReset?: Switch
  accountAlreadyRegistered?: Switch
  membershipRenewal?: { enabled?: boolean | null; daysBefore?: number | null } | null
  rsvpConfirmation?: Switch
  eventReminder?: { enabled?: boolean | null; hoursBefore?: number | null } | null
  approvalSubmitted?: Switch
  approvalDecision?: Switch
  backInStock?: Switch
  lowStockAlert?: Switch
  quietHours?: { enabled?: boolean | null; start?: string | null; end?: string | null } | null
}

/** Which email log template each switch governs. A template not listed here is never held by the schedule. */
export const SCHEDULE_TEMPLATES: Readonly<Record<string, ScheduleKey>> = {
  'account.welcome': 'accountWelcome',
  'account.reset': 'accountReset',
  'account.exists': 'accountAlreadyRegistered',
  'member.renewal': 'membershipRenewal',
  'rsvp.confirmation': 'rsvpConfirmation',
  'event.reminder': 'eventReminder',
  'approval.submitted': 'approvalSubmitted',
  'approval.step-ready': 'approvalSubmitted',
  'approval.decision': 'approvalDecision',
  'stock.back-in-stock': 'backInStock',
  'stock.alert': 'lowStockAlert',
}

const DEFAULT_DAYS_BEFORE = 7
const DEFAULT_HOURS_BEFORE = 24
const DEFAULT_QUIET_START = 21 * 60
const DEFAULT_QUIET_END = 7 * 60

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

const hasKey = (map: object, key: string): boolean => Object.prototype.hasOwnProperty.call(map, key)

/**
 * The switch that governs a send, or null when no switch holds it.
 *
 * Never held: test sends, resends of an earlier entry (resentFrom is set), and
 * password resets, because a person who asked for a reset must get it.
 */
export function scheduleKeyFor(template: string | undefined, resentFrom?: unknown): ScheduleKey | null {
  if (typeof resentFrom === 'number') return null
  if (!template || template === 'test') return null
  if (!hasKey(SCHEDULE_TEMPLATES, template)) return null
  const key = SCHEDULE_TEMPLATES[template]
  return key === 'accountReset' ? null : key
}

/**
 * Whether a switch lets its email go out. Every switch defaults to on except the
 * event reminder, which is opt-in. A missing row (null settings) gives the defaults.
 */
export function isTemplateEnabled(settings: EmailScheduleDoc | null | undefined, key: ScheduleKey): boolean {
  if (key === 'accountReset') return true
  const enabled = (settings?.[key] as { enabled?: boolean | null } | null | undefined)?.enabled
  if (typeof enabled === 'boolean') return enabled
  return key !== 'eventReminder'
}

/** Minutes after midnight for a 24-hour HH:MM value, or null when the value is not one. */
export function clockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = CLOCK.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * True when `now`, read as the wall clock in `timeZone`, falls inside the quiet
 * window. The window may cross midnight (21:00 to 07:00). Equal start and end
 * means there is no window. A bad time zone or clock value never holds anything.
 */
export function isInQuietHours(now: Date, timeZone: string, start: string, end: string): boolean {
  const from = clockMinutes(start) ?? DEFAULT_QUIET_START
  const to = clockMinutes(end) ?? DEFAULT_QUIET_END
  if (from === to) return false
  let wall: number
  try {
    const parts = wallTimeIn(now, timeZone)
    wall = parts.hour * 60 + parts.minute
  } catch {
    return false
  }
  if (Number.isNaN(wall)) return false
  return from < to ? wall >= from && wall < to : wall >= from || wall < to
}

/** Whether scheduled (reminder) emails are held right now. Transactional emails are never held. */
export function quietHoursHold(settings: EmailScheduleDoc | null | undefined, now: Date, timeZone: string): boolean {
  const quiet = settings?.quietHours
  if (!quiet || quiet.enabled !== true) return false
  return isInQuietHours(now, timeZone, quiet.start ?? '', quiet.end ?? '')
}

/**
 * Days before renewal to send the reminder: the schedule's value when it is a
 * whole number of days (at least 1), otherwise the Member settings value.
 */
export function renewalDaysFrom(settings: EmailScheduleDoc | null | undefined, memberDays: number): number {
  const days = settings?.membershipRenewal?.daysBefore
  return typeof days === 'number' && Number.isInteger(days) && days >= 1 ? days : memberDays
}

/** Hours before an event to send its reminder. A missing or bad value gives 24. */
export function eventHoursFrom(settings: EmailScheduleDoc | null | undefined): number {
  const hours = settings?.eventReminder?.hoursBefore
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 1 ? hours : DEFAULT_HOURS_BEFORE
}

/** Milliseconds since the epoch for a stored date (text or number), or null when it is not a date. */
export function toTime(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

export type EventLike = { id: number; title?: unknown; startDate?: unknown; trashedAt?: unknown }

/** Events that start after `now` and no later than `hoursBefore` hours from it, skipping trashed ones. */
export function eventsDueForReminder<T extends EventLike>(events: T[], now: Date, hoursBefore: number): T[] {
  const from = now.getTime()
  const until = from + hoursBefore * 60 * 60 * 1000
  return events.filter((event) => {
    if (event.trashedAt) return false
    const start = toTime(event.startDate)
    return start !== null && start > from && start <= until
  })
}

export type RsvpLike = { id: number; email?: unknown; reminderSentAt?: unknown }

/** An RSVP still owed its reminder: it has an email address and no reminder time yet. */
export function rsvpNeedsReminder(rsvp: RsvpLike): boolean {
  return typeof rsvp.email === 'string' && rsvp.email.trim().length > 0 && !rsvp.reminderSentAt
}

/** The event start as an Australian reader expects it, in the site's time zone. Empty when unknown. */
export function formatWhen(value: unknown, timeZone: string): string {
  const time = toTime(value)
  if (time === null) return ''
  try {
    return new Date(time).toLocaleString('en-AU', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
