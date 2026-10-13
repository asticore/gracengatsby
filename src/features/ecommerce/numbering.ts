import { normaliseInvoiceSettings, type InvoiceSettings } from './lib/invoiceSettings'

/**
 * Order and invoice numbers. Every function takes the D1 binding, so the server passes the real
 * database and the tests pass a local one.
 *
 * Counters live in `eg_number_counters` (one row per key, holding the LAST number handed out).
 * `takeNumber` is one upsert with RETURNING, so two requests racing for a number each get a
 * different one. The shop settings (Order numbers and Invoices tabs) only provide the starting
 * point: the counter never goes back, so lowering a setting cannot repeat a number.
 *
 * A number is written once: an order that already has one keeps it.
 */

export const ORDER_NUMBER_PADDING = 4
const ORDER_NUMBER_START_DEFAULT = 1001
const PAID_STATUSES = ['processing', 'completed', 'on-hold', 'refunded']

export type NumberingSettings = {
  orderPrefix: string
  orderStart: number
  invoice: InvoiceSettings
}

/** Letters, numbers and dashes only, so a prefix can never break a URL, a CSV or a page. */
export function sanitiseOrderPrefix(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/[^A-Za-z0-9-]/g, '').slice(0, 12) : ''
}

/** `GG-1001` from the prefix and the number, padded with zeros to at least `padding` digits. */
export function formatOrderNumber(prefix: string, n: number, padding = ORDER_NUMBER_PADDING): string {
  return `${sanitiseOrderPrefix(prefix)}${String(Math.max(0, Math.floor(n))).padStart(padding, '0')}`
}

const wholeOr = (value: unknown, fallback: number): number => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

/** Reads the numbering settings from the single shop-settings row; missing values fall back to the defaults. */
export async function readNumberingSettings(d1: D1Database): Promise<NumberingSettings> {
  const row = await d1
    .prepare('SELECT order_numbers_prefix, order_numbers_next_number, invoice_number_prefix, invoice_next_number, invoice_number_padding FROM eg_shop_settings ORDER BY id LIMIT 1')
    .first<Record<string, unknown>>()
  const r = row ?? {}
  return {
    orderPrefix: sanitiseOrderPrefix(r.order_numbers_prefix),
    orderStart: wholeOr(r.order_numbers_next_number, ORDER_NUMBER_START_DEFAULT),
    invoice: normaliseInvoiceSettings({
      numberPrefix: r.invoice_number_prefix,
      nextNumber: r.invoice_next_number,
      numberPadding: r.invoice_number_padding,
    }),
  }
}

/**
 * Takes the next number for a counter. One statement: the first call inserts the row at `start`,
 * later calls use max(last, start - 1) + 1, so the result is always unique and never below `start`.
 */
export async function takeNumber(d1: D1Database, key: 'order' | 'invoice', start: number): Promise<number> {
  const row = await d1
    .prepare(
      `INSERT INTO eg_number_counters (key, last_value, updated_at) VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(key) DO UPDATE SET last_value = MAX(eg_number_counters.last_value, ?2 - 1) + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       RETURNING last_value`,
    )
    .bind(key, start)
    .first<{ last_value: number }>()
  if (!row) throw new Error(`Could not allocate a ${key} number`)
  return Number(row.last_value)
}

/** The order number for a new order (called from the Orders create hook, before the row exists). */
export async function nextOrderNumber(d1: D1Database): Promise<string> {
  const settings = await readNumberingSettings(d1)
  const n = await takeNumber(d1, 'order', settings.orderStart)
  return formatOrderNumber(settings.orderPrefix, n)
}

/** True once money has been taken: paid time set, or a status that means paid (matches the printed invoice). */
export function isPaidOrder(order: { paid_at?: unknown; status?: unknown }): boolean {
  return Boolean(order.paid_at) || PAID_STATUSES.includes(String(order.status))
}

/**
 * Gives a paid order its invoice number if it has none, and returns the number on the order.
 * Unpaid orders get nothing (null), so a preview never uses up a number.
 *
 * The counter step and the order update run as one D1 batch (a transaction). The counter only
 * moves when the order still has no number, and the order takes the counter's value in the same
 * batch, so callers racing for one order consume exactly one number and all read it back.
 */
export async function ensureInvoiceNumber(d1: D1Database, orderId: number): Promise<string | null> {
  const order = await d1.prepare('SELECT invoice_number, paid_at, status FROM eg_orders WHERE id = ?1').bind(orderId).first<Record<string, unknown>>()
  if (!order) return null
  if (order.invoice_number) return String(order.invoice_number)
  if (!isPaidOrder({ paid_at: order.paid_at, status: order.status })) return null
  const { invoice } = await readNumberingSettings(d1)
  const start = invoice.nextNumber
  const stamp = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
  await d1.batch([
    d1.prepare(`INSERT INTO eg_number_counters (key, last_value, updated_at) VALUES ('invoice', ?1 - 1, ${stamp}) ON CONFLICT(key) DO NOTHING`).bind(start),
    d1
      .prepare(
        `UPDATE eg_number_counters SET last_value = MAX(last_value, ?1 - 1) + 1, updated_at = ${stamp}
         WHERE key = 'invoice' AND EXISTS (SELECT 1 FROM eg_orders WHERE id = ?2 AND COALESCE(invoice_number, '') = '')`,
      )
      .bind(start, orderId),
    d1
      .prepare(
        `UPDATE eg_orders SET invoice_number = ?1 || printf('%0*d', ?2, (SELECT last_value FROM eg_number_counters WHERE key = 'invoice'))
         WHERE id = ?3 AND COALESCE(invoice_number, '') = ''`,
      )
      .bind(invoice.numberPrefix, invoice.numberPadding, orderId),
  ])
  const stored = await d1.prepare('SELECT invoice_number FROM eg_orders WHERE id = ?1').bind(orderId).first<{ invoice_number: string | null }>()
  return stored?.invoice_number ?? null
}
