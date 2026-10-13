/**
 * Time zone helpers for recurring events. Pure: only Intl and Date.UTC arithmetic.
 *
 * Calendar maths works on day numbers (days since 1970-01-01, counted in UTC) so
 * that no daylight saving change can move a date by a day. A wall-clock time in a
 * zone becomes a real instant only through zonedToUtc, which measures the zone's
 * offset before and after its first guess.
 */

/** The zone used when an event does not say otherwise. */
export const EVENT_TIME_ZONE = 'Australia/Sydney'

export type YMD = { year: number; month: number; day: number }
export type WallTime = YMD & { hour: number; minute: number }

const DAY_MS = 86400000
const MINUTE_MS = 60000
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0')

/** The wall-clock date and time an instant shows in a zone. */
export function wallTimeIn(date: Date, timeZone: string): WallTime {
  const parts = formatterFor(timeZone).formatToParts(date)
  const num = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { year: num('year'), month: num('month'), day: num('day'), hour: num('hour') % 24, minute: num('minute') }
}

/** Offset of a zone from UTC at an instant, in ms (wall time read as UTC, minus the instant). */
function offsetAt(instant: number, timeZone: string): number {
  const w = wallTimeIn(new Date(instant), timeZone)
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(instant / MINUTE_MS) * MINUTE_MS
}

/**
 * The instant at which a zone shows this wall-clock time. Two passes against the
 * offset make it right on both sides of a daylight saving change. A time that does
 * not exist (the clocks jump over it) lands one hour later, as the zone does.
 */
export function zonedToUtc(wall: Pick<WallTime, 'year' | 'month' | 'day' | 'hour' | 'minute'>, timeZone: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)
  const first = guess - offsetAt(guess, timeZone)
  return new Date(guess - offsetAt(first, timeZone))
}

/** Days since 1970-01-01 for a calendar date. */
export function toDayNumber(ymd: YMD): number {
  return Math.round(Date.UTC(ymd.year, ymd.month - 1, ymd.day) / DAY_MS)
}

export function fromDayNumber(day: number): YMD {
  const d = new Date(day * DAY_MS)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOfDay(day: number): number {
  return (((day + 4) % 7) + 7) % 7
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** YYYY-MM-DD. */
export function isoDate(ymd: YMD): string {
  return `${pad(ymd.year, 4)}-${pad(ymd.month)}-${pad(ymd.day)}`
}

/** The calendar date from a YYYY-MM-DD string, or null when it is not a real date. */
export function parseIsoDate(value: unknown): YMD | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const ymd = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  if (ymd.month < 1 || ymd.month > 12 || ymd.day < 1 || ymd.day > daysInMonth(ymd.year, ymd.month)) return null
  return ymd
}

/** The calendar date an instant falls on in a zone, as YYYY-MM-DD. */
export function localDateIn(date: Date, timeZone: string): string {
  return isoDate(wallTimeIn(date, timeZone))
}

/** UTC in the basic iCalendar form, e.g. 20261015T093000Z. */
export function utcBasic(date: Date): string {
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}
