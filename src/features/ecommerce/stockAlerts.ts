/**
 * Low-stock and out-of-stock emails. `stockAlerts` is pure (compares a product before and after a
 * save); `sendStockAlerts` reads the Shop settings toggle and sends one email per save.
 */

import type { CollectionAfterChangeHook } from '@/engine'

import { computeStockStatus, DEFAULT_LOW_STOCK_THRESHOLD, type StockFields } from './stock'
import type { VariationRow } from './variations'

export type StockAlert = { kind: 'low' | 'out'; label: string; sku: string | null; qty: number }

type StockItem = StockFields & { id?: string; sku?: string | null; attributeValues?: string | null }

function crossed(before: StockItem | undefined, after: StockItem, label: string): StockAlert | null {
  if (!after.manageStock) return null
  const qtyAfter = typeof after.stockQty === 'number' ? after.stockQty : 0
  const qtyBefore = before?.manageStock && typeof before.stockQty === 'number' ? before.stockQty : null
  if (qtyBefore === null || qtyBefore === qtyAfter) return null
  const threshold = typeof after.lowStockThreshold === 'number' && after.lowStockThreshold >= 0 ? after.lowStockThreshold : DEFAULT_LOW_STOCK_THRESHOLD
  const wasIn = computeStockStatus({ ...before, manageStock: true }) === 'instock'
  if (wasIn && qtyAfter <= 0) return { kind: 'out', label, sku: after.sku ?? null, qty: qtyAfter }
  if (qtyAfter > 0 && qtyAfter <= threshold && qtyBefore > threshold) return { kind: 'low', label, sku: after.sku ?? null, qty: qtyAfter }
  return null
}

/** Alerts for the product itself and for each variation whose stock crossed a threshold in this save. */
export function stockAlerts(
  before: (StockItem & { title?: string; variations?: VariationRow[] | null }) | null | undefined,
  after: StockItem & { title?: string; variations?: VariationRow[] | null },
): StockAlert[] {
  if (!before) return []
  const title = after.title || 'Product'
  const alerts: StockAlert[] = []
  const own = crossed(before, after, title)
  if (own) alerts.push(own)
  const old = new Map((before.variations ?? []).map((variation) => [variation.id, variation as StockItem]))
  for (const variation of after.variations ?? []) {
    const alert = crossed(old.get(variation.id), variation as StockItem, `${title} (${(variation.attributeValues || '').replace(/\|/g, ', ')})`)
    if (alert) alerts.push(alert)
  }
  return alerts
}

type EngineLike = { findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown>> }

/** Sends the alerts in one email when Shop settings allow it. Never throws. */
export async function sendStockAlerts(engine: EngineLike, alerts: StockAlert[]): Promise<boolean> {
  if (alerts.length === 0) return false
  try {
    const settings = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true })) as Record<string, unknown>
    if (settings.lowStockEmails === false) return false
    const emails = (settings.emails ?? {}) as Record<string, unknown>
    const to = [settings.stockEmailTo, emails.adminEmail].find((value): value is string => typeof value === 'string' && value.includes('@'))
    if (!to) return false
    const lines = alerts.map((alert) => `${alert.kind === 'out' ? 'Out of stock' : 'Low stock'}: ${alert.label}${alert.sku ? ` (SKU ${alert.sku})` : ''} - ${alert.qty} left`)
    const subject = alerts.length === 1 ? `${alerts[0].kind === 'out' ? 'Out of stock' : 'Low stock'}: ${alerts[0].label}`.replace(/[\r\n]+/g, ' ') : `Stock alert: ${alerts.length} items`
    const { sendEmail } = await import('@/features/email')
    const result = await sendEmail({ to, template: 'stock.alert', subject, text: lines.join('\n') })
    return result.ok
  } catch {
    return false
  }
}

/** afterChange on Products: emails when a save moved stock across a threshold. */
export const stockAlertAfterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (previousDoc && doc && (doc as { _status?: string })._status !== 'draft') {
    const alerts = stockAlerts(previousDoc as never, doc as never)
    if (alerts.length > 0) await sendStockAlerts((req as unknown as { engine: EngineLike }).engine, alerts)
  }
  return doc
}