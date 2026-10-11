/**
 * Stock rules for products and variations. Pure, no I/O.
 *
 * `adjustStock` is the one function both the catalogue and the orders code call to change a
 * quantity: it never mutates its input, refuses to oversell unless backorders are allowed, and
 * reports which notification thresholds the change crossed so the caller can email once.
 */

export type Backorders = 'no' | 'notify' | 'yes'
export type StockStatus = 'instock' | 'outofstock' | 'onbackorder'

export type StockFields = {
  manageStock?: boolean | null
  stockQty?: number | null
  backorders?: Backorders | null
  lowStockThreshold?: number | null
  /** Used as-is when stock is not managed. */
  stockStatus?: StockStatus | null
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 2

const qtyOf = (item: StockFields): number => (typeof item.stockQty === 'number' && Number.isFinite(item.stockQty) ? Math.trunc(item.stockQty) : 0)

export const allowsBackorders = (item: StockFields): boolean => item.backorders === 'notify' || item.backorders === 'yes'

/** Computed status. With stock managed it follows the quantity; otherwise the manual status (default in stock). */
export function computeStockStatus(item: StockFields): StockStatus {
  if (!item.manageStock) return item.stockStatus === 'outofstock' || item.stockStatus === 'onbackorder' ? item.stockStatus : 'instock'
  if (qtyOf(item) > 0) return 'instock'
  return allowsBackorders(item) ? 'onbackorder' : 'outofstock'
}

/** True when `quantity` of this item can be bought now. */
export function canPurchase(item: StockFields, quantity = 1): boolean {
  if (!Number.isFinite(quantity) || quantity < 1) return false
  if (!item.manageStock) return computeStockStatus(item) !== 'outofstock'
  if (allowsBackorders(item)) return true
  return qtyOf(item) >= quantity
}

export type StockAdjustment = {
  ok: boolean
  reason?: 'insufficient'
  stockQty: number
  stockStatus: StockStatus
  /** Crossed from above the low-stock threshold to at or below it (and still in stock). */
  becameLow: boolean
  /** Crossed from in stock to out of stock. */
  becameOut: boolean
  changed: boolean
}

/**
 * Applies `delta` (negative to sell, positive to restock or refund) to a managed quantity.
 * An unmanaged item is returned untouched with ok true. A sale that would take a no-backorder item
 * below zero is refused with `reason: 'insufficient'` and nothing changes.
 */
export function adjustStock(item: StockFields, delta: number): StockAdjustment {
  const before = qtyOf(item)
  const statusBefore = computeStockStatus(item)
  if (!item.manageStock || !Number.isFinite(delta) || delta === 0) {
    return { ok: Number.isFinite(delta), stockQty: before, stockStatus: statusBefore, becameLow: false, becameOut: false, changed: false }
  }
  const next = before + Math.trunc(delta)
  if (next < 0 && !allowsBackorders(item)) {
    return { ok: false, reason: 'insufficient', stockQty: before, stockStatus: statusBefore, becameLow: false, becameOut: false, changed: false }
  }
  const after: StockFields = { ...item, stockQty: next }
  const statusAfter = computeStockStatus(after)
  const threshold = typeof item.lowStockThreshold === 'number' && item.lowStockThreshold >= 0 ? item.lowStockThreshold : DEFAULT_LOW_STOCK_THRESHOLD
  return {
    ok: true,
    stockQty: next,
    stockStatus: statusAfter,
    becameLow: next > 0 && next <= threshold && before > threshold,
    becameOut: statusBefore === 'instock' && next <= 0,
    changed: next !== before,
  }
}

/** What the product page says about availability. Low quantities are shown ("Only 2 left"); large ones are not. */
export function stockMessage(item: StockFields): string {
  const status = computeStockStatus(item)
  if (status === 'outofstock') return 'Out of stock'
  if (status === 'onbackorder') return 'Available on backorder'
  if (item.manageStock) {
    const qty = qtyOf(item)
    const threshold = typeof item.lowStockThreshold === 'number' && item.lowStockThreshold >= 0 ? item.lowStockThreshold : DEFAULT_LOW_STOCK_THRESHOLD
    if (qty > 0 && qty <= threshold) return `Only ${qty} left in stock`
  }
  return 'In stock'
}
