/**
 * Event check-in, as plain logic: the shape of one attendee, search, the
 * check-in toggle, the counts and the request check. No React and no engine
 * imports, so the admin view, the API route and the tests share one definition.
 *
 * An RSVP has no ticket code of its own, so its entry number serves as one:
 * "#42" (or "T-00042", or just "42") finds the RSVP with id 42.
 */

export type CheckInAttendee = {
  id: number
  name: string
  email: string
  guestCount: number
  /** The ticket type chosen on the event page; "" when the event has none. */
  ticketTier: string
  checkedIn: boolean
  /** ISO time of the check-in, or null when not checked in. */
  checkedInAt: string | null
}

export type CheckInCounts = {
  /** RSVPs checked in / RSVPs in total. */
  checkedIn: number
  total: number
  /** Guests (people in each party) checked in / in total. */
  guestsCheckedIn: number
  guestsTotal: number
}

export type TierCounts = { tier: string; checkedIn: number; total: number }

const MAX_TEXT = 200

const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '')

/** The entry number as a ticket code, for display: "#42". */
export function ticketCodeFor(id: number): string {
  return `#${id}`
}

/** One attendee from a stored or API row. Unusable rows are dropped (null). */
export function parseAttendee(raw: unknown): CheckInAttendee | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = Number(row.id)
  if (!Number.isInteger(id) || id < 1) return null
  const guests = Number(row.guestCount)
  const at = typeof row.checkedInAt === 'string' && !Number.isNaN(new Date(row.checkedInAt).getTime()) ? row.checkedInAt : null
  const checkedIn = row.checkedIn === true || row.checkedIn === 1
  return {
    id,
    name: text(row.name),
    email: text(row.email),
    guestCount: Number.isInteger(guests) && guests >= 1 ? guests : 1,
    ticketTier: text(row.ticketTier).trim(),
    checkedIn,
    checkedInAt: checkedIn ? at : null,
  }
}

/** Every usable attendee in a list, keeping the order given. */
export function parseAttendees(raw: unknown): CheckInAttendee[] {
  if (!Array.isArray(raw)) return []
  const out: CheckInAttendee[] = []
  for (const entry of raw) {
    const attendee = parseAttendee(entry)
    if (attendee) out.push(attendee)
  }
  return out
}

/** The text a search is matched against: the trimmed, lower-cased query with spaces collapsed. */
export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * The digits of a ticket-code search: "#00042", "T-42" and "42" all mean 42.
 * Null when the query is not a code at all (so it is only matched as text).
 */
export function codeFromQuery(query: string): number | null {
  const match = /^(?:#|t-?)?0*(\d{1,9})$/.exec(normaliseQuery(query))
  if (!match) return null
  const n = Number(match[1])
  return n > 0 ? n : null
}

/** True when the attendee matches the query: by name, email, or ticket code. An empty query matches everyone. */
export function matchesQuery(attendee: CheckInAttendee, query: string): boolean {
  const q = normaliseQuery(query)
  if (!q) return true
  const code = codeFromQuery(query)
  if (code !== null && attendee.id === code) return true
  return attendee.name.toLowerCase().includes(q) || attendee.email.toLowerCase().includes(q)
}

/** The attendees matching a search, in the order given. */
export function filterAttendees(attendees: CheckInAttendee[], query: string): CheckInAttendee[] {
  return attendees.filter((attendee) => matchesQuery(attendee, query))
}

/**
 * Sets one attendee's check-in state, as the UI shows it straight away. Checking
 * in stamps `at`; undoing clears the time. Anything else in the list is untouched.
 */
export function setCheckedIn(attendees: CheckInAttendee[], id: number, checkedIn: boolean, at: string | null): CheckInAttendee[] {
  return attendees.map((attendee) =>
    attendee.id === id ? { ...attendee, checkedIn, checkedInAt: checkedIn ? at : null } : attendee,
  )
}

/** Live counts for the header: RSVPs and guests, checked in and in total. */
export function countCheckIns(attendees: CheckInAttendee[]): CheckInCounts {
  const counts: CheckInCounts = { checkedIn: 0, total: attendees.length, guestsCheckedIn: 0, guestsTotal: 0 }
  for (const attendee of attendees) {
    counts.guestsTotal += attendee.guestCount
    if (attendee.checkedIn) {
      counts.checkedIn += 1
      counts.guestsCheckedIn += attendee.guestCount
    }
  }
  return counts
}

/** Check-ins and totals per ticket type, in the order the types first appear. "" is listed as 'No ticket type'. */
export function countByTier(attendees: CheckInAttendee[]): TierCounts[] {
  const rows = new Map<string, TierCounts>()
  for (const attendee of attendees) {
    const key = attendee.ticketTier
    const row = rows.get(key) ?? { tier: key || 'No ticket type', checkedIn: 0, total: 0 }
    row.total += 1
    if (attendee.checkedIn) row.checkedIn += 1
    rows.set(key, row)
  }
  return [...rows.values()]
}

export type CheckInRequest = { rsvpId: number; checkedIn: boolean }

/** Checks a POST body: a positive integer id and a true/false flag. */
export function parseCheckInRequest(body: unknown): { ok: true; request: CheckInRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' }
  const raw = body as Record<string, unknown>
  const rsvpId = Number(raw.rsvpId)
  if (!Number.isInteger(rsvpId) || rsvpId < 1) return { ok: false, error: 'Choose a guest to check in.' }
  if (typeof raw.checkedIn !== 'boolean') return { ok: false, error: 'Say whether the guest is checked in or not.' }
  return { ok: true, request: { rsvpId, checkedIn: raw.checkedIn } }
}
