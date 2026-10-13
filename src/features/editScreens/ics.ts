import { forEachText } from './textFields'
import { rruleFromRecurrence } from './recurrence'

/**
 * iCalendar (RFC 5545) for one public event. Pure: no I/O, no framework imports.
 * Lines end with CRLF, text values are escaped, and every content line is
 * folded at 75 octets (counted in UTF-8, never splitting a character).
 */

const CRLF = '\r\n'
const MAX_OCTETS = 75
const ONE_HOUR_MS = 60 * 60 * 1000
const encoder = new TextEncoder()

export type IcsEvent = {
  uid: string
  stamp: Date
  start: Date
  end: Date
  summary: string
  location?: string
  description?: string
  url?: string
  /** Repeat rule without the RRULE: prefix, e.g. FREQ=WEEKLY;INTERVAL=1. */
  rrule?: string | null
}

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function icsEscape(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** UTC date-time in the basic form, e.g. 20261015T093000Z. */
export function icsDateTime(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
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

/** Folds one content line: continuation lines start with a single space. */
export function foldLine(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  let limit = MAX_OCTETS
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
      limit = MAX_OCTETS - 1
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join(CRLF + ' ')
}

/** A complete VCALENDAR holding one VEVENT. */
export function buildEventIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Website//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(event.uid)}`,
    `DTSTAMP:${icsDateTime(event.stamp)}`,
    `LAST-MODIFIED:${icsDateTime(event.stamp)}`,
    `DTSTART:${icsDateTime(event.start)}`,
    `DTEND:${icsDateTime(event.end)}`,
    event.rrule ? `RRULE:${event.rrule}` : null,
    `SUMMARY:${icsEscape(event.summary)}`,
    event.location ? `LOCATION:${icsEscape(event.location)}` : null,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
    event.url ? `URL:${event.url}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines
    .filter((line): line is string => line !== null)
    .map(foldLine)
    .join(CRLF) + CRLF
}

/** The slice of an event document the calendar entry needs. */
export type IcsEventSource = {
  id: number | string
  title?: string | null
  slug?: string | null
  summary?: string | null
  description?: unknown
  startDate?: string | null
  endDate?: string | null
  updatedAt?: string | null
  location?: { venueName?: string | null; address?: string | null; isOnline?: boolean | null } | null
  /** The stored repeat group; a repeating event's feed entry carries an RRULE. */
  recurrence?: unknown
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Plain words from a rich text value (only strings under text keys count). */
export function plainText(value: unknown): string {
  const parts: string[] = []
  forEachText(value, (text) => parts.push(text))
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Calendar text for a published event, or null when it has no usable start
 * date or slug. `origin` is the site origin, e.g. https://example.com.
 * Without an end date the event is given one hour.
 */
export function icsFromEvent(doc: IcsEventSource, origin: string): string | null {
  const start = parseDate(doc.startDate)
  const slug = typeof doc.slug === 'string' ? doc.slug : ''
  if (!start || !slug) return null

  const endParsed = parseDate(doc.endDate)
  const end = endParsed && endParsed.getTime() >= start.getTime() ? endParsed : new Date(start.getTime() + ONE_HOUR_MS)
  const stamp = parseDate(doc.updatedAt) ?? start
  const base = origin.replace(/\/+$/, '')
  const host = new URL(base).hostname

  const venue = [doc.location?.venueName, doc.location?.address].filter(Boolean).join(', ')
  const location = venue || (doc.location?.isOnline ? 'Online' : '')
  const description = plainText(doc.description) || (doc.summary ?? '').trim()

  return buildEventIcs({
    uid: `event-${doc.id}@${host}`,
    stamp,
    start,
    end,
    summary: doc.title?.trim() || 'Event',
    location,
    description,
    url: `${base}/events/${slug}`,
    rrule: rruleFromRecurrence(doc.recurrence, start),
  })
}
