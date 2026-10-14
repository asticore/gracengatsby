/**
 * Low stock and abandoned-cart numbers for the Shop reports screen. Server only.
 * Products only: variation stock is not listed here yet (see the wave 19 notes).
 */
import { DEFAULT_LOW_STOCK_THRESHOLD } from '@/features/ecommerce/stock'
import type { ReportRange } from './range'
import { PAGE_SIZE } from './queries'
import { pageOf } from './shape'

type D1 = { prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results: T[] }> } } }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

export type LowStockRow = { productId: number; title: string; sku: string | null; stockQty: number; threshold: number }

/** Products that manage stock and are at or under their low stock threshold (the default when none is set). */
export async function loadLowStock(d1: D1, pageValue: unknown, limit = PAGE_SIZE): Promise<{ rows: LowStockRow[]; total: number; page: number }> {
  const { page, offset } = pageOf(pageValue, limit)
  const found = (
    await d1
      .prepare(
        `SELECT p.id AS id, p.title AS title, p.sku AS sku, COALESCE(p.stock_qty,0) AS stock_qty,
           COALESCE(p.low_stock_threshold, ?1) AS threshold, COUNT(*) OVER () AS total
         FROM eg_products p
         WHERE COALESCE(p.manage_stock,0) = 1 AND COALESCE(p.stock_qty,0) <= COALESCE(p.low_stock_threshold, ?1)
         ORDER BY COALESCE(p.stock_qty,0) ASC, p.id ASC LIMIT ?2 OFFSET ?3`,
      )
      .bind(DEFAULT_LOW_STOCK_THRESHOLD, limit, offset)
      .all<Record<string, unknown>>()
  ).results
  return {
    rows: found.map((r) => ({
      productId: num(r.id),
      title: String(r.title ?? 'Untitled'),
      sku: typeof r.sku === 'string' ? r.sku : null,
      stockQty: num(r.stock_qty),
      threshold: num(r.threshold),
    })),
    total: found.length ? num(found[0].total) : 0,
    page,
  }
}

export type AbandonedNumbers = { abandoned: number; reminded: number; recovered: number; recoveryRatePct: number | null }

/**
 * "Left behind": carts with an email that were not bought, last changed in the range. "Reminded": carts in
 * the range that got at least one reminder email. "Recovered": reminded carts bought after a reminder, in the range.
 */
export async function loadAbandoned(d1: D1, range: ReportRange): Promise<AbandonedNumbers> {
  const [row] = (
    await d1
      .prepare(
        `SELECT
           SUM(CASE WHEN c.purchased_at IS NULL THEN 1 ELSE 0 END) AS abandoned,
           SUM(CASE WHEN COALESCE(c.reminders_sent,0) > 0 THEN 1 ELSE 0 END) AS reminded,
           SUM(CASE WHEN c.recovered_at IS NOT NULL AND date(c.recovered_at) BETWEEN ?1 AND ?2 THEN 1 ELSE 0 END) AS recovered
         FROM eg_carts c
         WHERE c.email IS NOT NULL AND c.email != '' AND date(c.updated_at) BETWEEN ?1 AND ?2`,
      )
      .bind(range.from, range.to)
      .all<Record<string, unknown>>()
  ).results
  const reminded = num(row?.reminded)
  const recovered = num(row?.recovered)
  return {
    abandoned: num(row?.abandoned),
    reminded,
    recovered,
    recoveryRatePct: reminded > 0 ? Math.round((recovered / reminded) * 1000) / 10 : null,
  }
}
