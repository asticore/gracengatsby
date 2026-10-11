/**
 * Validation for POST /api/ad-track. The body is tiny and fixed-shape; anything
 * else is dropped. The count is our own: a viewable impression measured in the
 * visitor's browser, not the network's billing number.
 */

import { isAdKey } from './validate'

export const MAX_TRACK_BYTES = 512
const BOT_PATTERN = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python|node-fetch|axios|java\/|go-http|libwww|phantom|puppeteer|playwright|facebookexternalhit/i

export type TrackEvent = { unit: string; event: 'v' | 'c'; bp: 'm' | 't' | 'd' }

export function parseTrackBody(input: unknown): TrackEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const b = input as Record<string, unknown>
  if (!isAdKey(b.u)) return null
  if (b.e !== 'v' && b.e !== 'c') return null
  if (b.b !== 'm' && b.b !== 't' && b.b !== 'd') return null
  if (Object.keys(b).some((k) => k !== 'u' && k !== 'e' && k !== 'b')) return null
  return { unit: b.u, event: b.e, bp: b.b }
}

export const isLikelyBot = (userAgent: string | null | undefined): boolean => !userAgent || userAgent.length < 10 || userAgent.length > 400 || BOT_PATTERN.test(userAgent)

/** Same-origin browser requests only. Fetch metadata is sent by every current browser. */
export const isSameOriginRequest = (secFetchSite: string | null): boolean => secFetchSite === null || secFetchSite === 'same-origin'

export const todayUtc = (now: Date = new Date()): string => now.toISOString().slice(0, 10)

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Validates a report range; defaults to the last 30 days. Capped at 366 days. */
export function parseRange(from: unknown, to: unknown, now: Date = new Date()): { from: string; to: string } {
  const end = typeof to === 'string' && DAY_PATTERN.test(to) && !Number.isNaN(Date.parse(to)) ? to : todayUtc(now)
  const defaultStart = new Date(Date.parse(end) - 29 * 86_400_000).toISOString().slice(0, 10)
  let start = typeof from === 'string' && DAY_PATTERN.test(from) && !Number.isNaN(Date.parse(from)) ? from : defaultStart
  if (start > end) start = end
  const min = new Date(Date.parse(end) - 365 * 86_400_000).toISOString().slice(0, 10)
  if (start < min) start = min
  return { from: start, to: end }
}

export type ReportRow = { unit: string; impressions: number; clicks: number; ctr: number | null }

/** CTR only where clicks were actually observable (clicks > 0); network ad clicks are not visible to us. */
export const ctrOf = (impressions: number, clicks: number): number | null => (clicks > 0 && impressions > 0 ? clicks / impressions : null)

/** Most beacon writes accepted per unit per minute per isolate; the rest are dropped (counting is best effort). */
export const MAX_WRITES_PER_UNIT_PER_MINUTE = 600
const writeWindows = new Map<string, { minute: number; count: number }>()

/** True when this unit may still be written in the current minute. Bounded memory: stale windows are pruned. */
export function allowUnitWrite(unit: string, now: number = Date.now(), max: number = MAX_WRITES_PER_UNIT_PER_MINUTE): boolean {
  const minute = Math.floor(now / 60_000)
  if (writeWindows.size > 500) {
    for (const [key, window] of writeWindows) if (window.minute !== minute) writeWindows.delete(key)
  }
  const current = writeWindows.get(unit)
  if (!current || current.minute !== minute) {
    writeWindows.set(unit, { minute, count: 1 })
    return true
  }
  if (current.count >= max) return false
  current.count += 1
  return true
}

export const resetUnitWriteWindows = (): void => writeWindows.clear()
