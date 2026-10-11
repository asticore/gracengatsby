/**
 * Price resolution for products and variations. Pure, no I/O.
 *
 * `priceInAUD` is the regular price, in the same unit the rest of the shop uses (see Products.ts).
 * A sale price applies only while it is lower than the regular price and `now` falls inside the
 * optional from/to window. Dates are compared as calendar dates when they carry no time part
 * ("2026-12-31" means through the end of that day, UTC).
 */

export type PriceFields = {
  priceInAUD?: number | null
  salePrice?: number | null
  saleFrom?: string | null
  saleTo?: string | null
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function boundary(value: string | null | undefined, end: boolean): number | null {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const parsed = DATE_ONLY.test(text) ? Date.parse(`${text}T${end ? '23:59:59.999' : '00:00:00.000'}Z`) : Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

const isMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** True when a valid sale price is in force at `now`. */
export function isSaleActive(item: PriceFields, now: Date = new Date()): boolean {
  if (!isMoney(item.salePrice)) return false
  if (isMoney(item.priceInAUD) && item.salePrice >= item.priceInAUD) return false
  const time = now.getTime()
  const from = boundary(item.saleFrom, false)
  const to = boundary(item.saleTo, true)
  if (from !== null && time < from) return false
  if (to !== null && time > to) return false
  return true
}

/** The price a customer pays right now, or null when the item has no price. */
export function effectivePrice(item: PriceFields, now: Date = new Date()): number | null {
  if (isSaleActive(item, now)) return item.salePrice as number
  return isMoney(item.priceInAUD) ? item.priceInAUD : null
}

export type PriceInfo = { price: number | null; regular: number | null; onSale: boolean }

export function priceInfo(item: PriceFields, now: Date = new Date()): PriceInfo {
  const onSale = isSaleActive(item, now)
  return {
    price: effectivePrice(item, now),
    regular: isMoney(item.priceInAUD) ? item.priceInAUD : null,
    onSale,
  }
}
