import type { FormFieldDef } from './types'

/**
 * Pure rules for appointment slots: what a booked slot looks like as a key,
 * and whether a slot is full. No I/O, so the same answer comes out in the
 * browser, on the availability endpoint and in the submit pipeline.
 *
 * A booked answer is stored as "YYYY-MM-DD HH:MM" (see validate.ts). The key
 * used for comparison is exactly that text, so two bookings match only when
 * the day and the start time are the same.
 */

export const SLOT_DEFAULT_CAPACITY = 1
export const SLOT_MAX_CAPACITY = 50
export const SLOT_TAKEN_MESSAGE = 'That time was just taken, please pick another.'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/
const STORED_PATTERN = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/

/** A real calendar day as YYYY-MM-DD, or null. */
export function normaliseSlotDate(text: unknown): string | null {
  const match = DATE_PATTERN.exec(String(text ?? '').trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? `${match[1]}-${match[2]}-${match[3]}` : null
}

/** A 24-hour start time as HH:MM ("9:30" becomes "09:30"), or null. */
export function normaliseSlotTime(text: unknown): string | null {
  const match = TIME_PATTERN.exec(String(text ?? '').trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

/** The comparison key for one booked slot: "YYYY-MM-DD HH:MM", or null when either part is unusable. */
export function slotKey(date: unknown, time: unknown): string | null {
  const day = normaliseSlotDate(date)
  const clock = normaliseSlotTime(time)
  return day && clock ? `${day} ${clock}` : null
}

/** The key for a stored answer, accepting either the space or the T separator. */
export function slotKeyFromValue(value: unknown): string | null {
  const match = STORED_PATTERN.exec(String(value ?? '').trim())
  return match ? slotKey(match[1], match[2]) : null
}

/** How many bookings one slot takes, clamped to 1..SLOT_MAX_CAPACITY. Anything unusable means the default of 1. */
export function slotCapacity(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return SLOT_DEFAULT_CAPACITY
  return Math.min(SLOT_MAX_CAPACITY, Math.max(1, Math.floor(n)))
}

/** True when `key` already has `capacity` bookings among `existingKeys`. */
export function isSlotTaken(existingKeys: readonly string[], key: string, capacity: number = SLOT_DEFAULT_CAPACITY): boolean {
  const limit = slotCapacity(capacity)
  let count = 0
  for (const existing of existingKeys) {
    if (existing === key && ++count >= limit) return true
  }
  return false
}

/** The start times on `date` that are full, as HH:MM, in the order they were first seen. */
export function takenTimesOn(existingKeys: readonly string[], date: string, capacity: number = SLOT_DEFAULT_CAPACITY): string[] {
  const counts = new Map<string, number>()
  for (const existing of existingKeys) {
    if (!existing.startsWith(`${date} `)) continue
    counts.set(existing, (counts.get(existing) || 0) + 1)
  }
  const limit = slotCapacity(capacity)
  const taken: string[] = []
  for (const [key, count] of counts) {
    if (count >= limit) taken.push(key.slice(date.length + 1))
  }
  return taken
}

/** The appointment fields of a form, with their capacity resolved. */
export function appointmentFields(fields: FormFieldDef[]): { name: string; capacity: number }[] {
  return fields
    .filter((field) => field.type === 'appointment' && typeof field.name === 'string' && field.name !== '')
    .map((field) => ({ name: field.name as string, capacity: slotCapacity(field.appointment?.capacity) }))
}
