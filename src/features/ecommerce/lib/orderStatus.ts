export const ORDER_STATUSES = ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending payment',
  processing: 'Processing',
  'on-hold': 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  failed: 'Failed',
}

/** Which statuses an order may move to from each status. Anything else is refused. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'on-hold', 'cancelled', 'failed'],
  processing: ['completed', 'on-hold', 'cancelled', 'refunded'],
  'on-hold': ['processing', 'completed', 'cancelled', 'refunded'],
  completed: ['refunded', 'processing'],
  cancelled: ['pending'],
  refunded: [],
  failed: ['pending', 'cancelled'],
}

export const PAID_STATUSES: OrderStatus[] = ['processing', 'on-hold', 'completed', 'refunded']

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value)
}

export function canTransition(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!isOrderStatus(to)) return false
  if (!from) return true // a new order may start in any status
  if (!isOrderStatus(from)) return true // legacy row with an unknown status: do not lock it
  if (from === to) return true
  return ORDER_TRANSITIONS[from].includes(to)
}

export function transitionError(from: string | null | undefined, to: string | null | undefined): string | null {
  if (canTransition(from, to)) return null
  return `An order cannot move from "${from}" to "${to}".`
}

/** Cents still refundable: what was paid less what is already refunded. Never negative. */
export function refundableCents(order: { amount?: number | null; refundedTotal?: number | null }): number {
  return Math.max(0, (order.amount ?? 0) - (order.refundedTotal ?? 0))
}

export type RefundCheck = { ok: true; fullRefund: boolean } | { ok: false; error: string }

export function validateRefund(order: { amount?: number | null; refundedTotal?: number | null; status?: string | null }, amountCents: unknown): RefundCheck {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, error: 'The refund amount must be a positive whole number of cents.' }
  }
  if (!order.status || !PAID_STATUSES.includes(order.status as OrderStatus)) {
    return { ok: false, error: 'Only a paid order can be refunded.' }
  }
  const left = refundableCents(order)
  if (amountCents > left) {
    return { ok: false, error: `The refund exceeds what is left to refund (${(left / 100).toFixed(2)}).` }
  }
  return { ok: true, fullRefund: amountCents === left }
}
