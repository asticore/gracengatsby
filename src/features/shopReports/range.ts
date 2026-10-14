/**
 * Date ranges for Shop reports. Pure. Dates are calendar days (YYYY-MM-DD) in UTC, both ends
 * inclusive. The report screen shows which days it used, so nobody has to guess.
 */

export type RangePreset = '7d' | '30d' | '90d' | 'month' | 'custom'
export type Bucket = 'day' | 'week' | 'month'

export const MAX_CUSTOM_DAYS = 366

const DAY_MS = 86_400_000
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export type ReportRange = { preset: RangePreset; from: string; to: string; days: number; bucket: Bucket }

export function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_RE.test(value)) return false
  const ms = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

/** The UTC calendar day of `now`, as YYYY-MM-DD. */
export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}

/** The bucket a range shows by default: days for short ranges, weeks for longer ones, months beyond a year. */
export function defaultBucket(days: number): Bucket {
  if (days <= 92) return 'day'
  if (days <= 366) return 'week'
  return 'month'
}

export function parseBucket(value: unknown): Bucket | null {
  return value === 'day' || value === 'week' || value === 'month' ? value : null
}

/**
 * Resolves the query string into a range. Unknown presets fall back to 30 days. A custom range
 * with bad dates, or with `to` before `from`, falls back to 30 days too; a custom range longer
 * than MAX_CUSTOM_DAYS is shortened to end at `to`.
 */
export function resolveRange(input: { preset?: unknown; from?: unknown; to?: unknown; bucket?: unknown }, now: Date = new Date()): ReportRange {
  const today = todayUtc(now)
  const requested: RangePreset = input.preset === '7d' || input.preset === '90d' || input.preset === 'month' || input.preset === 'custom' ? input.preset : '30d'

  if (requested === 'custom') {
    if (isDay(input.from) && isDay(input.to) && input.from <= input.to) {
      const to = input.to
      const from = daysBetween(input.from, to) > MAX_CUSTOM_DAYS ? shiftDay(to, -(MAX_CUSTOM_DAYS - 1)) : input.from
      return finish('custom', from, to, input.bucket)
    }
    return finish('30d', shiftDay(today, -29), today, input.bucket)
  }
  if (requested === 'month') return finish('month', `${today.slice(0, 8)}01`, today, input.bucket)
  const back = requested === '7d' ? 6 : requested === '90d' ? 89 : 29
  return finish(requested, shiftDay(today, -back), today, input.bucket)
}

function finish(preset: RangePreset, from: string, to: string, bucket: unknown): ReportRange {
  const days = daysBetween(from, to)
  return { preset, from, to, days, bucket: parseBucket(bucket) ?? defaultBucket(days) }
}

/** Start day of the bucket that contains `day`: the day itself, its Monday, or the 1st of its month. */
export function bucketStart(day: string, bucket: Bucket): string {
  if (bucket === 'month') return `${day.slice(0, 8)}01`
  if (bucket === 'week') {
    const weekday = new Date(Date.parse(`${day}T00:00:00Z`)).getUTCDay() // 0 = Sunday
    return shiftDay(day, -((weekday + 6) % 7))
  }
  return day
}

/** The start of the next bucket after `start`. */
export function nextBucket(start: string, bucket: Bucket): string {
  if (bucket === 'day') return shiftDay(start, 1)
  if (bucket === 'week') return shiftDay(start, 7)
  const d = new Date(Date.parse(`${start}T00:00:00Z`))
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}
