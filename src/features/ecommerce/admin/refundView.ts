import { linePaidCents, type RefundedLine } from '../lib/refundLines'

/** What the refund panel reads from GET /api/admin-order-refund/[id]. */
export type RefundInfo = {
  refunds: { id: number; amount: number; reason?: string; method?: string; createdAt: string; providerRefundId?: string }[]
  amount: number
  refundedTotal: number
  status?: string
  lineItems: { name?: string; quantity?: number; lineCents?: number; discountCents?: number; taxCents?: number }[]
  refundedByLine: Record<string, RefundedLine>
  shippingTotal: number
  shippingRefunded: number
  pricesIncludeTax: boolean
  canCardRefund: boolean
  canStoreCredit?: boolean
}

/** What the admin has typed for one line. Units and amounts stay text until they are sent. */
export type LineRow = { units: string; amount: string; restock: boolean }

export type LineView = {
  index: number
  name: string
  quantity: number
  paid: number
  doneAmount: number
  doneUnits: number
  unitsLeft: number
  amountLeft: number
  row: LineRow
}

export const EMPTY_ROW: LineRow = { units: '', amount: '', restock: false }

/** Dollars typed in a box to whole cents. Anything that is not a positive number is zero. */
export function toCents(text: string): number {
  const cents = Math.round(Number(text) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : 0
}

/** Units typed in a box to a whole number. Anything that is not a positive number is zero. */
export function toUnits(text: string): number {
  const units = Math.floor(Number(text))
  return Number.isFinite(units) && units > 0 ? units : 0
}

export function buildLineViews(info: RefundInfo, rows: Record<number, LineRow>): LineView[] {
  return info.lineItems.map((line, index) => {
    const done = info.refundedByLine[String(index)] ?? { amount: 0, quantity: 0 }
    const paid = linePaidCents(line, info.pricesIncludeTax)
    return {
      index,
      name: line.name || `Item ${index + 1}`,
      quantity: line.quantity ?? 0,
      paid,
      doneAmount: done.amount,
      doneUnits: done.quantity,
      unitsLeft: Math.max(0, (line.quantity ?? 0) - done.quantity),
      amountLeft: Math.max(0, paid - done.amount),
      row: rows[index] ?? EMPTY_ROW,
    }
  })
}

/** The lines and shipping the admin has picked, as the refund route expects them, and the total they add up to. */
export function selectedRefund(lines: LineView[], shippingValue: string): { lines: { lineId: number; quantity: number; amount: number; restock: boolean }[]; shippingCents: number; total: number } {
  const picked = lines
    .map((l) => ({ lineId: l.index, quantity: Math.min(toUnits(l.row.units), l.unitsLeft), amount: Math.min(toCents(l.row.amount), l.amountLeft), restock: l.row.restock }))
    .filter((l) => l.quantity > 0 || l.amount > 0)
  const shippingCents = toCents(shippingValue)
  const total = picked.reduce((sum, l) => sum + l.amount, 0) + shippingCents
  return { lines: picked, shippingCents, total }
}
