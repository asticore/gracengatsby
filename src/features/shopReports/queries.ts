/**
 * Shop report aggregates, computed in SQL on D1. Server only (imports the raw D1 helper).
 * Every query takes the range as ?1 (from) and ?2 (to), both YYYY-MM-DD in UTC, inclusive.
 * "Paid" means an order whose status is one that has been paid for (see PAID_STATUSES in
 * ../ecommerce/lib/orderStatus.ts). Money is whole cents throughout.
 */
import type { Bucket, ReportRange } from './range'
import { pageOf, type SeriesRow } from './shape'

export const PAID_IN = "('processing','on-hold','completed','refunded')"
/** The day an order counts on: when it was paid, or when it was placed if no payment time is set. */
export const ORDER_DAY = 'date(COALESCE(o.paid_at, o.created_at))'
const IN_RANGE = `${ORDER_DAY} BETWEEN ?1 AND ?2`
export const ORDERS_WHERE = `o.status IN ${PAID_IN} AND ${IN_RANGE}`

export const PAGE_SIZE = 20
export const EXPORT_LIMIT = 5000

type D1 = { prepare: (sql: string) => { bind: (...args: unknown[]) => { all: <T>() => Promise<{ results: T[] }> } } }

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

async function rows<T>(d1: D1, sql: string, args: unknown[]): Promise<T[]> {
  return (await d1.prepare(sql).bind(...args).all<T>()).results
}

export type Kpis = {
  orders: number
  revenueCents: number
  discountCents: number
  shippingCents: number
  taxCents: number
  refundCount: number
  refundsCents: number
  unitsSold: number
  customers: number
  newCustomers: number
  returningCustomers: number
}

/** Order-level totals, refunds, units and the new versus returning split. */
export async function loadKpis(d1: D1, range: ReportRange): Promise<Kpis> {
  const [order] = await rows<Record<string, unknown>>(
    d1,
    `SELECT COUNT(*) AS orders, COALESCE(SUM(o.amount),0) AS revenue, COALESCE(SUM(o.discount_total),0) AS discount,
       COALESCE(SUM(o.shipping_total),0) AS shipping, COALESCE(SUM(o.tax_total),0) AS tax
     FROM eg_orders o WHERE ${ORDERS_WHERE}`,
    [range.from, range.to],
  )
  const [refund] = await rows<Record<string, unknown>>(
    d1,
    `SELECT COUNT(*) AS refunds, COALESCE(SUM(r.amount),0) AS refunded FROM eg_order_refunds r
     WHERE COALESCE(r.status,'completed') = 'completed' AND date(r.created_at) BETWEEN ?1 AND ?2`,
    [range.from, range.to],
  )
  const [units] = await rows<Record<string, unknown>>(
    d1,
    `SELECT COALESCE(SUM(CAST(json_extract(li.value,'$.quantity') AS INTEGER)),0) AS units
     FROM eg_orders o, json_each(o.line_items) AS li
     WHERE ${ORDERS_WHERE} AND COALESCE(json_extract(li.value,'$.isGiftCard'),0) != 1`,
    [range.from, range.to],
  )
  // A customer is an email address. "Returning" means that address had a paid order before the range.
  const [people] = await rows<Record<string, unknown>>(
    d1,
    `WITH inrange AS (
       SELECT lower(o.customer_email) AS email FROM eg_orders o
       WHERE ${ORDERS_WHERE} AND o.customer_email IS NOT NULL AND o.customer_email != ''
       GROUP BY lower(o.customer_email))
     SELECT COUNT(*) AS customers,
       COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM eg_orders p WHERE lower(p.customer_email) = inrange.email
         AND p.status IN ${PAID_IN} AND date(COALESCE(p.paid_at, p.created_at)) < ?1) THEN 1 ELSE 0 END),0) AS returning_count
     FROM inrange`,
    [range.from, range.to],
  )
  const customers = num(people?.customers)
  const returning = num(people?.returning_count)
  return {
    orders: num(order?.orders),
    revenueCents: num(order?.revenue),
    discountCents: num(order?.discount),
    shippingCents: num(order?.shipping),
    taxCents: num(order?.tax),
    refundCount: num(refund?.refunds),
    refundsCents: num(refund?.refunded),
    unitsSold: num(units?.units),
    customers,
    newCustomers: customers - returning,
    returningCustomers: returning,
  }
}

/** Revenue and order count per bucket. Gaps are filled by fillSeries in shape.ts. */
export async function loadSeries(d1: D1, range: ReportRange, bucket: Bucket): Promise<SeriesRow[]> {
  // The bucket start is computed in SQL so it matches bucketStart in range.ts.
  const startSql =
    bucket === 'month'
      ? `strftime('%Y-%m-01', COALESCE(o.paid_at, o.created_at))`
      : bucket === 'week'
        ? `date(COALESCE(o.paid_at, o.created_at), printf('-%d days', (CAST(strftime('%w', COALESCE(o.paid_at, o.created_at)) AS INTEGER) + 6) % 7))`
        : ORDER_DAY
  const found = await rows<{ bucket: string; orders: number; revenue: number }>(
    d1,
    `SELECT ${startSql} AS bucket, COUNT(*) AS orders, COALESCE(SUM(o.amount),0) AS revenue
     FROM eg_orders o WHERE ${ORDERS_WHERE} GROUP BY bucket ORDER BY bucket`,
    [range.from, range.to],
  )
  return found.map((r) => ({ bucket: String(r.bucket), orders: num(r.orders), revenueCents: num(r.revenue) }))
}

export type ProductRow = { productId: number | null; name: string; units: number; revenueCents: number; category: string | null }

/** Products ranked by net line revenue (after line discounts). Gift card lines are left out. */
export async function loadTopProducts(d1: D1, range: ReportRange, pageValue: unknown, limit = PAGE_SIZE): Promise<{ rows: ProductRow[]; total: number; page: number }> {
  const { page, offset } = pageOf(pageValue, limit)
  const found = await rows<Record<string, unknown>>(
    d1,
    `SELECT CAST(json_extract(li.value,'$.productId') AS INTEGER) AS product_id,
       MAX(COALESCE(json_extract(li.value,'$.name'),'Removed product')) AS name,
       MAX(p.category) AS category,
       SUM(CAST(json_extract(li.value,'$.quantity') AS INTEGER)) AS units,
       SUM(CAST(json_extract(li.value,'$.lineCents') AS INTEGER) - COALESCE(CAST(json_extract(li.value,'$.discountCents') AS INTEGER),0)) AS revenue,
       COUNT(*) OVER () AS total
     FROM eg_orders o, json_each(o.line_items) AS li
     LEFT JOIN eg_products p ON p.id = CAST(json_extract(li.value,'$.productId') AS INTEGER)
     WHERE ${ORDERS_WHERE} AND COALESCE(json_extract(li.value,'$.isGiftCard'),0) != 1
     GROUP BY product_id ORDER BY revenue DESC, product_id LIMIT ?3 OFFSET ?4`,
    [range.from, range.to, limit, offset],
  )
  return {
    rows: found.map((r) => ({
      productId: r.product_id === null ? null : num(r.product_id),
      name: String(r.name ?? 'Removed product'),
      units: num(r.units),
      revenueCents: num(r.revenue),
      category: typeof r.category === 'string' ? r.category : null,
    })),
    total: found.length ? num(found[0].total) : 0,
    page,
  }
}

/** Revenue by product category (physical or digital, the product's category field). */
export async function loadCategories(d1: D1, range: ReportRange): Promise<{ category: string; units: number; revenueCents: number }[]> {
  const found = await rows<Record<string, unknown>>(
    d1,
    `SELECT COALESCE(p.category,'Uncategorised') AS category,
       SUM(CAST(json_extract(li.value,'$.quantity') AS INTEGER)) AS units,
       SUM(CAST(json_extract(li.value,'$.lineCents') AS INTEGER) - COALESCE(CAST(json_extract(li.value,'$.discountCents') AS INTEGER),0)) AS revenue
     FROM eg_orders o, json_each(o.line_items) AS li
     LEFT JOIN eg_products p ON p.id = CAST(json_extract(li.value,'$.productId') AS INTEGER)
     WHERE ${ORDERS_WHERE} AND COALESCE(json_extract(li.value,'$.isGiftCard'),0) != 1
     GROUP BY category ORDER BY revenue DESC`,
    [range.from, range.to],
  )
  return found.map((r) => ({ category: String(r.category), units: num(r.units), revenueCents: num(r.revenue) }))
}

/** Coupon uses (one per order that carried the code) and the discount they gave. */
export async function loadCoupons(d1: D1, range: ReportRange): Promise<{ code: string; uses: number; discountCents: number }[]> {
  const found = await rows<Record<string, unknown>>(
    d1,
    `SELECT UPPER(json_extract(c.value,'$.code')) AS code, COUNT(*) AS uses,
       COALESCE(SUM(CAST(json_extract(c.value,'$.discountCents') AS INTEGER)),0) AS discount
     FROM eg_orders o, json_each(o.coupon_lines) AS c
     WHERE ${ORDERS_WHERE} AND json_extract(c.value,'$.code') IS NOT NULL
     GROUP BY code ORDER BY uses DESC, code`,
    [range.from, range.to],
  )
  return found.map((r) => ({ code: String(r.code), uses: num(r.uses), discountCents: num(r.discount) }))
}

/** Orders and revenue by how the first payment was taken. Orders paid only with gift cards or credit show as "none". */
export async function loadPayments(d1: D1, range: ReportRange): Promise<{ method: string; orders: number; revenueCents: number }[]> {
  const found = await rows<Record<string, unknown>>(
    d1,
    `SELECT COALESCE((SELECT t.payment_method FROM eg_transactions t WHERE t.order_id = o.id ORDER BY t.id LIMIT 1),'none') AS method,
       COUNT(*) AS orders, COALESCE(SUM(o.amount),0) AS revenue
     FROM eg_orders o WHERE ${ORDERS_WHERE} GROUP BY method ORDER BY revenue DESC`,
    [range.from, range.to],
  )
  return found.map((r) => ({ method: String(r.method), orders: num(r.orders), revenueCents: num(r.revenue) }))
}

export type LocationRow = { country: string; state: string; orders: number; revenueCents: number }

/** Orders and revenue by shipping country and state. */
export async function loadLocations(d1: D1, range: ReportRange, pageValue: unknown, limit = PAGE_SIZE): Promise<{ rows: LocationRow[]; total: number; page: number }> {
  const { page, offset } = pageOf(pageValue, limit)
  const found = await rows<Record<string, unknown>>(
    d1,
    `SELECT COALESCE(NULLIF(o.shipping_address_country,''),'Not given') AS country,
       COALESCE(NULLIF(o.shipping_address_state,''),'') AS state,
       COUNT(*) AS orders, COALESCE(SUM(o.amount),0) AS revenue, COUNT(*) OVER () AS total
     FROM eg_orders o WHERE ${ORDERS_WHERE}
     GROUP BY country, state ORDER BY revenue DESC, country, state LIMIT ?3 OFFSET ?4`,
    [range.from, range.to, limit, offset],
  )
  return {
    rows: found.map((r) => ({ country: String(r.country), state: String(r.state), orders: num(r.orders), revenueCents: num(r.revenue) })),
    total: found.length ? num(found[0].total) : 0,
    page,
  }
}
