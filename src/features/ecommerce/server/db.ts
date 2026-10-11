import { getDb } from '@/cms/db/connect'

/** The raw D1 binding behind drizzle, for the few atomic single-statement updates the shop needs. */
export async function rawD1(): Promise<D1Database> {
  const db = (await getDb()) as unknown as { $client: D1Database }
  return db.$client
}

/** Runs one statement and returns how many rows it changed. */
export async function runChanges(d1: D1Database, statement: string, ...params: unknown[]): Promise<number> {
  const res = await d1.prepare(statement).bind(...params).run()
  return res.meta?.changes ?? 0
}

/**
 * Atomic statements. Each is a single conditional UPDATE, so two requests
 * racing for the same row cannot both succeed: the loser changes 0 rows.
 */
export const SQL = {
  /** pending/failed -> processing exactly once (idempotent webhooks). */
  markPaid: `UPDATE eg_orders SET status = 'processing', paid_at = ?2 WHERE id = ?1 AND status IN ('pending','failed')`,
  /** Reserve refund headroom: only succeeds if the refund fits within what was paid. */
  reserveRefund: `UPDATE eg_orders SET refunded_total = COALESCE(refunded_total,0) + ?2 WHERE id = ?1 AND ?2 > 0 AND COALESCE(refunded_total,0) + ?2 <= COALESCE(amount,0) AND status IN ('processing','on-hold','completed','refunded')`,
  releaseRefund: `UPDATE eg_orders SET refunded_total = MAX(0, COALESCE(refunded_total,0) - ?2) WHERE id = ?1`,
  /** One-shot flags. */
  flagCouponApplied: `UPDATE eg_orders SET coupon_usage_applied = 1 WHERE id = ?1 AND COALESCE(coupon_usage_applied,0) = 0`,
  flagStockAdjusted: `UPDATE eg_orders SET stock_adjusted = 1 WHERE id = ?1 AND COALESCE(stock_adjusted,0) = 0`,
  unflagStockAdjusted: `UPDATE eg_orders SET stock_adjusted = 0 WHERE id = ?1 AND COALESCE(stock_adjusted,0) = 1`,
  /** Counts a use only while under the total limit. */
  redeemCoupon: `UPDATE eg_coupons SET usage_count = COALESCE(usage_count,0) + 1 WHERE id = ?1 AND (usage_limit IS NULL OR usage_limit <= 0 OR COALESCE(usage_count,0) < usage_limit)`,
  cartPurchased: `UPDATE eg_carts SET purchased_at = ?2 WHERE id = ?1 AND purchased_at IS NULL`,
  cartRecovered: `UPDATE eg_carts SET recovered_at = ?2 WHERE id = ?1 AND recovered_at IS NULL AND COALESCE(reminders_sent,0) > 0`,
  cartReminded: `UPDATE eg_carts SET reminders_sent = ?2, last_reminder_at = ?3 WHERE id = ?1`,
  /** Suppresses the cart's address everywhere: every cart (and any future cart) with the same email is silenced. */
  cartUnsubscribe: `UPDATE eg_carts SET unsubscribed = 1 WHERE id = ?1 OR (email IS NOT NULL AND email != '' AND lower(email) = (SELECT lower(email) FROM eg_carts WHERE id = ?1))`,
} as const
