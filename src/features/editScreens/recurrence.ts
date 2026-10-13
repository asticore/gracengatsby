/**
 * Repeat rules for events: read the stored group, work out the dates it covers,
 * and write the matching iCalendar RRULE. Pure: no I/O, no framework imports.
 *
 * The first date of a series is the event itself, so expansion always starts on
 * the event's own start. Skipped dates are left out of the result, and `count`
 * counts the dates that do happen.
 */

import {
  EVENT_TIME_ZONE,
  daysInMonth,
  fromDayNumber,
  isoDate,
  parseIsoDate,
  toDayNumber,
  utcBasic,
  wallTimeIn,
  weekdayOfDay,
  zonedToUtc,
  type YMD,
} from './timeZone'

export const MAX_OCCURRENCES = 52

export type RecurrenceRule = {
  frequency: 'daily' | 'weekly' | 'monthly'
  /** Every N days, weeks or months. */
  interval: number
  /** Weekly only. 0 = Sunday ... 6 = Saturday. Empty means the weekday of the first date. */
  weekdays: number[]
  /** Monthly only: the same day of the month, or the same nth weekday (e.g. the second Tuesday). */
  monthlyBy: 'dayOfMonth' | 'nthWeekday'
  /** Last date that can happen, inclusive. Null means a year from the first date. */
  until: YMD | null
  /** Most dates to keep, including the first. Null means the cap of MAX_OCCURRENCES. */
  count: number | null
  /** ISO dates that do not happen. */
  skipDates: string[]
}

export type Occurrence = { date: string; start: Date; end: Date | null }

export type Expansion = { occurrences: Occurrence[]; truncated: boolean }

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DEFAULT_SPAN_DAYS = 365

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (value === '' || value === null || value === undefined) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** 0-6 from names or abbreviations ("Mon, Wednesday" or "mon wed"), or from numbers. */
export function parseWeekdays(raw: unknown): number[] {
  const items: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,;/]+/) : []
  const found = new Set<number>()
  for (const item of items) {
    if (typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 6) {
      found.add(item)
    } else if (typeof item === 'string' && item.trim().length >= 3) {
      const index = WEEKDAY_NAMES.indexOf(item.trim().slice(0, 3).toLowerCase())
      if (index >= 0) found.add(index)
    }
  }
  return [...found].sort((a, b) => a - b)
}

/** Skipped dates from one-per-line text. Anything that is not a real YYYY-MM-DD is ignored. */
export function parseSkipDates(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const dates = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    const ymd = parseIsoDate(line)
    if (ymd) dates.add(isoDate(ymd))
  }
  return [...dates].sort()
}

function parseUntil(raw: unknown, timeZone: string): YMD | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const plain = parseIsoDate(raw)
  if (plain) return plain
  // A date field may store a full timestamp; the day is the one shown in the event's zone.
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  const wall = wallTimeIn(date, timeZone)
  return { year: wall.year, month: wall.month, day: wall.day }
}

/**
 * The rule from a stored `recurrence` group (frequency, interval, weekdays, monthlyBy,
 * until, count, exceptions). Null when the event does not repeat or the frequency is unknown.
 */
export function parseRecurrence(raw: unknown, timeZone = EVENT_TIME_ZONE): RecurrenceRule | null {
  if (!raw || typeof raw !== 'object') return null
  const group = raw as Record<string, unknown>
  const frequency = group.frequency
  if (frequency !== 'daily' && frequency !== 'weekly' && frequency !== 'monthly') return null
  return {
    frequency,
    interval: clampInt(group.interval, 1, MAX_OCCURRENCES, 1),
    weekdays: parseWeekdays(group.weekdays),
    monthlyBy: group.monthlyBy === 'nthWeekday' ? 'nthWeekday' : 'dayOfMonth',
    until: parseUntil(group.until, timeZone),
    count: group.count === '' || group.count === null || group.count === undefined ? null : clampInt(group.count, 1, MAX_OCCURRENCES, MAX_OCCURRENCES),
    skipDates: parseSkipDates(group.exceptions),
  }
}

/** Day numbers in order that the rule lands on, from the first date until `untilDay`. Unbounded in count. */
function* candidateDays(startDay: number, startWall: YMD, rule: RecurrenceRule, untilDay: number): Generator<number> {
  const { interval } = rule
  if (rule.frequency === 'daily') {
    for (let day = startDay; day <= untilDay; day += interval) yield day
    return
  }
  if (rule.frequency === 'weekly') {
    // Weeks run Monday to Sunday, so offsets are counted from Monday.
    const mondayOffset = (day: number): number => (weekdayOfDay(day) + 6) % 7
    const weekStart = startDay - mondayOffset(startDay)
    const offsets = (rule.weekdays.length > 0 ? rule.weekdays : [weekdayOfDay(startDay)])
      .map((weekday) => (weekday + 6) % 7)
      .sort((a, b) => a - b)
    for (let week = weekStart; week <= untilDay; week += 7 * interval) {
      for (const offset of offsets) {
        const day = week + offset
        if (day >= startDay && day <= untilDay) yield day
      }
    }
    return
  }
  // Monthly. A month with no such day (the 31st in April) is skipped, as calendars do.
  const startMonth = startWall.year * 12 + (startWall.month - 1)
  const nth = Math.ceil(startWall.day / 7)
  for (let k = 0; ; k += 1) {
    const index = startMonth + k * interval
    const year = Math.floor(index / 12)
    const month = (index % 12) + 1
    const firstOfMonth = toDayNumber({ year, month, day: 1 })
    if (firstOfMonth > untilDay) return
    let day = startWall.day
    if (rule.monthlyBy === 'nthWeekday') {
      const firstWeekday = weekdayOfDay(firstOfMonth)
      day = 1 + ((weekdayOfDay(startDay) - firstWeekday + 7) % 7) + 7 * (nth - 1)
    }
    if (day > daysInMonth(year, month)) continue
    const candidate = firstOfMonth + day - 1
    if (candidate >= startDay && candidate <= untilDay) yield candidate
  }
}

/**
 * The dates a rule produces, each with its start and end instants. Times are kept on
 * the wall clock of `timeZone`, so a 9am event stays at 9am across a daylight saving
 * change. The end keeps the same number of calendar days after the start as the
 * event's own end does.
 */
export function expandRecurrence(input: { start: Date; end: Date | null; rule: RecurrenceRule; timeZone?: string }): Expansion {
  const { start, end, rule } = input
  const timeZone = input.timeZone ?? EVENT_TIME_ZONE
  const startWall = wallTimeIn(start, timeZone)
  const startDay = toDayNumber(startWall)
  const endWall = end && end.getTime() >= start.getTime() ? wallTimeIn(end, timeZone) : null
  const endDayDelta = endWall ? toDayNumber(endWall) - startDay : 0
  const untilDay = rule.until ? toDayNumber(rule.until) : startDay + DEFAULT_SPAN_DAYS
  const limit = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES)
  const skip = new Set(rule.skipDates)

  const occurrences: Occurrence[] = []
  let truncated = false
  for (const day of candidateDays(startDay, startWall, rule, untilDay)) {
    const wall = fromDayNumber(day)
    const date = isoDate(wall)
    if (skip.has(date)) continue
    if (occurrences.length >= limit) {
      truncated = true
      break
    }
    const occurrenceStart = zonedToUtc({ ...wall, hour: startWall.hour, minute: startWall.minute }, timeZone)
    const occurrenceEnd = endWall
      ? zonedToUtc({ ...fromDayNumber(day + endDayDelta), hour: endWall.hour, minute: endWall.minute }, timeZone)
      : null
    occurrences.push({ date, start: occurrenceStart, end: occurrenceEnd })
  }
  return { occurrences, truncated }
}

/**
 * The iCalendar RRULE for the rule (FREQ, INTERVAL, BYDAY, UNTIL or COUNT). Skipped
 * dates are not written here, so a calendar app will still show them.
 */
export function buildRRule(rule: RecurrenceRule, start: Date, timeZone = EVENT_TIME_ZONE): string {
  const startWall = wallTimeIn(start, timeZone)
  const startWeekday = weekdayOfDay(toDayNumber(startWall))
  const parts = [
    `FREQ=${rule.frequency === 'daily' ? 'DAILY' : rule.frequency === 'weekly' ? 'WEEKLY' : 'MONTHLY'}`,
    `INTERVAL=${rule.interval}`,
  ]
  if (rule.frequency === 'weekly' && rule.weekdays.length > 0) {
    parts.push(`BYDAY=${rule.weekdays.map((weekday) => BYDAY_CODES[weekday]).join(',')}`)
  }
  if (rule.frequency === 'monthly' && rule.monthlyBy === 'nthWeekday') {
    parts.push(`BYDAY=${Math.ceil(startWall.day / 7)}${BYDAY_CODES[startWeekday]}`)
  }
  if (rule.count !== null) {
    parts.push(`COUNT=${rule.count}`)
  } else {
    // UNTIL is written in UTC (the feed's DTSTART is UTC), at the end of the last day.
    const last = rule.until ?? fromDayNumber(toDayNumber(startWall) + DEFAULT_SPAN_DAYS)
    parts.push(`UNTIL=${utcBasic(zonedToUtc({ ...last, hour: 23, minute: 59 }, timeZone))}`)
  }
  return parts.join(';')
}

/** The RRULE for a stored recurrence group, or null when the event does not repeat. */
export function rruleFromRecurrence(raw: unknown, start: Date, timeZone = EVENT_TIME_ZONE): string | null {
  const rule = parseRecurrence(raw, timeZone)
  return rule ? buildRRule(rule, start, timeZone) : null
}
