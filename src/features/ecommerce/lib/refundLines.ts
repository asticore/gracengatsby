/**
 * Line-item refunds: which order lines (and shipping) a refund covers, what each line paid, what was
 * already refunded, and whether a new request fits. Pure: no database, so the refund hook
 * (server/refunds.ts), the refund route and the admin panel all share one set of rules.
 *
 * A line's `lineId` is its position in the order's lineItems array. Order lines have no id of their own,
 * and lineItems are never reordered after the order is placed. Money is in whole cents.
 */

export type RefundLineRequest = { lineId: number; quantity: number; amount: number; restock: boolean }

export type OrderLineLike = {
  name?: string | null
  quantity?: number | null
  lineCents?: number | null
  discountCents?: number | null
  taxCents?: number | null
}

/** A saved refund row, as the engine returns it (camelCase field names). */
export type RefundRowLike = { lines?: unknown; shippingAmount?: number | null; amount?: number | null }

export type RefundedLine = { amount: number; quantity: number }

export type LineRefundCheck =
  | { ok: true; lines: RefundLineRequest[]; shippingCents: number; amount: number; restockItems: { index: number; quantity: number }[] }
  | { ok: false; error: string }

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`

/** What the customer paid for one line: the line total less its discount, plus tax when prices exclude tax. */
export function linePaidCents(line: OrderLineLike, pricesIncludeTax: boolean): number {
  const gross = Math.max(0, line.lineCents ?? 0)
  const tax = pricesIncludeTax ? 0 : Math.max(0, line.taxCents ?? 0)
  return Math.max(0, gross - Math.max(0, line.discountCents ?? 0) + tax)
}

/** Quantity and money already refunded for each line, across the saved refunds of an order. */
export function refundedByLine(refunds: RefundRowLike[]): Map<number, RefundedLine> {
  const totals = new Map<number, RefundedLine>()
  for (const refund of refunds) {
    if (!Array.isArray(refund.lines)) continue
    for (const row of refund.lines) {
      if (!isObject(row) || !Number.isInteger(row.lineId)) continue
      const id = row.lineId as number
      const prior = totals.get(id) ?? { amount: 0, quantity: 0 }
      totals.set(id, {
        amount: prior.amount + (Number(row.amount) || 0),
        quantity: prior.quantity + (Number(row.quantity) || 0),
      })
    }
  }
  return totals
}

/** Shipping already refunded across the saved refunds of an order. */
export function refundedShippingCents(refunds: RefundRowLike[]): number {
  return refunds.reduce((sum, refund) => sum + (Number(refund.shippingAmount) || 0), 0)
}

/**
 * Turns the request body's `lines` into clean rows. Entries that refund nothing are dropped and repeats of
 * one line are added together. Anything that is not a whole, non-negative number, or a line that is not on
 * the order, is refused.
 */
export function parseLineRequests(input: unknown, lineCount: number): { ok: true; lines: RefundLineRequest[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, lines: [] }
  if (!Array.isArray(input)) return { ok: false, error: 'The refund lines must be a list.' }
  const merged = new Map<number, RefundLineRequest>()
  for (const raw of input) {
    if (!isObject(raw)) return { ok: false, error: 'Each refund line must name a line and an amount.' }
    const lineId = raw.lineId
    if (!Number.isInteger(lineId) || (lineId as number) < 0 || (lineId as number) >= lineCount) return { ok: false, error: 'That line is not on this order.' }
    const quantity = raw.quantity ?? 0
    const amount = raw.amount ?? 0
    if (!Number.isInteger(quantity) || (quantity as number) < 0) return { ok: false, error: 'Units to refund must be a whole number, zero or more.' }
    if (!Number.isInteger(amount) || (amount as number) < 0) return { ok: false, error: 'Line refund amounts must be whole cents, zero or more.' }
    const id = lineId as number
    const prior = merged.get(id) ?? { lineId: id, quantity: 0, amount: 0, restock: false }
    merged.set(id, { lineId: id, quantity: prior.quantity + (quantity as number), amount: prior.amount + (amount as number), restock: prior.restock || raw.restock === true })
  }
  const lines = [...merged.values()].filter((l) => l.quantity > 0 || l.amount > 0).sort((a, b) => a.lineId - b.lineId)
  return { ok: true, lines }
}

type OrderForLines = {
  lineItems?: unknown
  pricesIncludeTax?: boolean | null
  shippingTotal?: number | null
}

/**
 * Checks a line-item refund against what each line paid and what was already refunded, and works out the
 * total. Shipping is capped at what the customer paid for shipping. The caller still checks the total
 * against what is left on the whole order.
 */
export function validateLineRefund(args: { order: OrderForLines; priorRefunds: RefundRowLike[]; lines: unknown; shippingCents: unknown }): LineRefundCheck {
  const orderLines = (Array.isArray(args.order.lineItems) ? args.order.lineItems : []) as OrderLineLike[]
  const parsed = parseLineRequests(args.lines, orderLines.length)
  if (!parsed.ok) return { ok: false, error: (parsed as { error: string }).error }

  let shipping = 0
  if (args.shippingCents !== undefined && args.shippingCents !== null) {
    if (!Number.isInteger(args.shippingCents) || (args.shippingCents as number) < 0) return { ok: false, error: 'The shipping refund must be whole cents, zero or more.' }
    shipping = args.shippingCents as number
  }

  const done = refundedByLine(args.priorRefunds)
  const doneShipping = refundedShippingCents(args.priorRefunds)
  const paidShipping = Math.max(0, args.order.shippingTotal ?? 0)
  if (shipping > Math.max(0, paidShipping - doneShipping)) {
    return { ok: false, error: `Only ${dollars(Math.max(0, paidShipping - doneShipping))} of shipping is left to refund.` }
  }

  for (const line of parsed.lines) {
    const source: OrderLineLike = orderLines[line.lineId] ?? {}
    const name = source?.name || `Line ${line.lineId + 1}`
    const prior = done.get(line.lineId) ?? { amount: 0, quantity: 0 }
    const paid = linePaidCents(source, Boolean(args.order.pricesIncludeTax))
    const amountLeft = Math.max(0, paid - prior.amount)
    if (line.amount > amountLeft) return { ok: false, error: `${name}: only ${dollars(amountLeft)} is left to refund on this line.` }
    const unitsLeft = Math.max(0, (source?.quantity ?? 0) - prior.quantity)
    if (line.quantity > unitsLeft) return { ok: false, error: `${name}: only ${unitsLeft} unit(s) are left to refund.` }
  }

  const lineTotal = parsed.lines.reduce((sum, l) => sum + l.amount, 0)
  const amount = lineTotal + shipping
  if (amount <= 0) return { ok: false, error: 'Choose at least one line or the shipping to refund.' }
  const restockItems = parsed.lines.filter((l) => l.restock && l.quantity > 0).map((l) => ({ index: l.lineId, quantity: l.quantity }))
  return { ok: true, lines: parsed.lines, shippingCents: shipping, amount, restockItems }
}
