/**
 * Pre-orders: a product can be sold before it ships. Pure, no I/O.
 *
 * A pre-order is live when the product has the flag, the shop setting (Storefront > Pre-orders) is on,
 * and the release date is still ahead (or no date is set). Once the date passes it stops by itself.
 */

export const PREORDER_LABEL = 'Pre-order'
export const PREORDER_STOCK_MESSAGE = 'Available to pre-order'
const NOTE_MAX = 500
const SHIP_FORMAT = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney' })

export type PreorderFields = {
  preorder?: boolean | null
  preorderReleaseDate?: string | null
  preorderNote?: string | null
}

export type PreorderInfo = { active: boolean; shipsFrom: string | null; note: string | null }

/**
 * True while the product takes pre-orders: flag on, and no release date yet or one still ahead.
 * `enabled` is the shop-wide switch; it is always on today (no setting exists for it yet).
 */
export function isPreorderActive(product: PreorderFields | null | undefined, now: Date = new Date(), enabled = true): boolean {
  if (!enabled || !product || product.preorder !== true) return false
  if (!product.preorderReleaseDate) return true
  const release = new Date(product.preorderReleaseDate).getTime()
  if (!Number.isFinite(release)) return true
  return release > now.getTime()
}

/** "1 November 2026" in Sydney time, or null for a missing or unreadable date. */
export function formatShipDate(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return SHIP_FORMAT.format(date)
}

/** Everything the storefront and the cart need about a pre-order, already limited to what is live now. */
export function preorderInfo(product: PreorderFields | null | undefined, now: Date = new Date(), enabled = true): PreorderInfo {
  const active = isPreorderActive(product, now, enabled)
  const note = typeof product?.preorderNote === 'string' ? product.preorderNote.trim().slice(0, NOTE_MAX) : ''
  return {
    active,
    shipsFrom: active ? formatShipDate(product?.preorderReleaseDate ?? null) : null,
    note: active && note ? note : null,
  }
}

type PreorderLine = { name?: string; preorder?: { releaseDate?: string | null; note?: string | null } | null }

/**
 * One plain sentence listing the pre-order lines of an order, for the customer email and the admin panel.
 * Empty when the order has no pre-order lines.
 */
export function preorderSummary(lineItems: unknown): string {
  const lines = (Array.isArray(lineItems) ? lineItems : []) as PreorderLine[]
  const parts = lines
    .filter((line) => line && line.preorder)
    .map((line) => {
      const ships = formatShipDate(line.preorder?.releaseDate ?? null)
      const note = typeof line.preorder?.note === 'string' ? line.preorder.note.trim() : ''
      return `${line.name ?? 'Item'}${ships ? ` (ships from ${ships})` : ' (pre-order)'}${note ? `: ${note}` : ''}`
    })
  return parts.length > 0 ? `Pre-order: ${parts.join('; ')}.` : ''
}