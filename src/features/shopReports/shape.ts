/**
 * Shapes raw SQL rows for the report screen and the CSV export. Pure, so it can be tested without a database.
 */
import { bucketStart, nextBucket, type Bucket } from './range'

export type SeriesRow = { bucket: string; orders: number; revenueCents: number }
export type SeriesPoint = SeriesRow & { label: string }

/**
 * Gives every bucket in [from, to] a point, with zeros where nothing sold, so the chart has no gaps.
 * `rows` may hold buckets as day, Monday-of-week or first-of-month strings (see bucketStart).
 */
export function fillSeries(rows: SeriesRow[], from: string, to: string, bucket: Bucket): SeriesPoint[] {
  const byStart = new Map<string, SeriesRow>()
  for (const row of rows) {
    const key = bucketStart(row.bucket, bucket)
    const prev = byStart.get(key)
    byStart.set(key, prev ? { bucket: key, orders: prev.orders + row.orders, revenueCents: prev.revenueCents + row.revenueCents } : { ...row, bucket: key })
  }
  const points: SeriesPoint[] = []
  for (let start = bucketStart(from, bucket); start <= to; start = nextBucket(start, bucket)) {
    const hit = byStart.get(start)
    points.push({ bucket: start, label: start, orders: hit?.orders ?? 0, revenueCents: hit?.revenueCents ?? 0 })
  }
  return points
}

/** Average order value in whole cents, rounded half-up. Zero orders gives zero, never NaN. */
export function averageOrderCents(revenueCents: number, orders: number): number {
  if (!orders || orders <= 0) return 0
  return Math.round(revenueCents / orders)
}

/** Percentage to one decimal, or null when there is no base to compare with. */
export function percentOfTotal(part: number, total: number): number | null {
  if (!total || total <= 0) return null
  return Math.round((part / total) * 1000) / 10
}

/** Clamps a page number and size from the query string. Pages start at 1. */
export function pageOf(value: unknown, size: number): { page: number; offset: number; limit: number } {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : 1
  const page = Number.isInteger(n) && n >= 1 ? Math.min(n, 100000) : 1
  return { page, offset: (page - 1) * size, limit: size }
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}
