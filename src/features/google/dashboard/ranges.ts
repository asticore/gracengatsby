/**
 * Date windows for the dashboard. Pure functions (no I/O) so they can be tested and used anywhere.
 *
 * Search Console data lags by about three days, so the 28-day window ends three days before today.
 * Analytics and AdSense use the same windows so the numbers line up across cards.
 */

import type { DateRange } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

/** YYYY-MM-DD in UTC. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const shift = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS)

/** Current and previous 28-day windows ending `lagDays` before `today`. */
export function twoPeriods(today: Date, lagDays: number): { range: DateRange; previousRange: DateRange } {
  const end = shift(today, -lagDays)
  const start = shift(end, -27)
  const prevEnd = shift(end, -28)
  const prevStart = shift(prevEnd, -27)
  return {
    range: { from: formatDay(start), to: formatDay(end) },
    previousRange: { from: formatDay(prevStart), to: formatDay(prevEnd) },
  }
}

/** Search Console: 28 days, ending three days ago because of the reporting lag. */
export const searchWindows = (today: Date) => twoPeriods(today, 3)

/** Analytics and AdSense: 28 days, ending yesterday. */
export const recentWindows = (today: Date) => twoPeriods(today, 1)
