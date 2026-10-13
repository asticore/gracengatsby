import type { ListFilter } from '@/admin/list/listQuery'
import { ORDER_STATUSES } from './orderStatus'

/**
 * The orders list's filter bar, expressed as the generic list filters (`field:op:value` in the URL).
 * The bar owns these four fields: when it changes one, it replaces the matching filters and leaves
 * the rest of the list's filters alone.
 *
 * Payment is read from the order's own fields: paid = a paid-at time is set, not paid = it is not,
 * refunded = some money has been refunded. Dates are the day an order was placed; a day is the
 * stored timestamp's date part, so comparing with the plain day string covers the whole day.
 */

export const ORDER_FILTER_FIELDS = ['status', 'paidAt', 'refundedTotal', 'createdAt'] as const

export type PaymentChoice = 'any' | 'paid' | 'unpaid' | 'refunded'

export type OrderPicks = {
  /** An order status, or '' for any. */
  status: string
  payment: PaymentChoice
  /** YYYY-MM-DD, or '' for no start date. */
  from: string
  /** YYYY-MM-DD, inclusive, or '' for no end date. */
  to: string
}

export const EMPTY_ORDER_PICKS: OrderPicks = { status: '', payment: 'any', from: '', to: '' }

export const PAYMENT_CHOICES: { value: PaymentChoice; label: string; tooltip: string }[] = [
  { value: 'any', label: 'Any payment', tooltip: 'Show orders whatever their payment state.' },
  { value: 'paid', label: 'Paid', tooltip: 'Payment has been received for the order.' },
  { value: 'unpaid', label: 'Not paid yet', tooltip: 'No payment received yet, for example a card payment that has not gone through.' },
  { value: 'refunded', label: 'Refunded', tooltip: 'Some or all of the money has been refunded.' },
]

export const STATUS_CHOICES: readonly string[] = ORDER_STATUSES

const DAY = /^\d{4}-\d{2}-\d{2}$/
const validDay = (value: string | undefined): string => (value && DAY.test(value.slice(0, 10)) ? value.slice(0, 10) : '')

/** The day after (or before, for negative numbers) a YYYY-MM-DD string. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Reads the bar's picks back out of the list's filters. */
export function readOrderPicks(filters: ListFilter[]): OrderPicks {
  const find = (field: string, op?: string) => filters.find((f) => f.field === field && (!op || f.op === op))
  const status = find('status', 'equals')?.value ?? ''
  const paid = find('paidAt', 'exists')?.value
  const refunded = find('refundedTotal', 'greater_than')
  const payment: PaymentChoice = paid === 'true' ? 'paid' : paid === 'false' ? 'unpaid' : refunded ? 'refunded' : 'any'
  const from = validDay(find('createdAt', 'greater_than')?.value)
  const toExclusive = validDay(find('createdAt', 'less_than')?.value)
  return { status: STATUS_CHOICES.includes(status) ? status : '', payment, from, to: toExclusive ? addDays(toExclusive, -1) : '' }
}

/** The list's filters with the bar's four fields replaced by the picks. */
export function applyOrderPicks(current: ListFilter[], picks: OrderPicks): ListFilter[] {
  const kept = current.filter((f) => !(ORDER_FILTER_FIELDS as readonly string[]).includes(f.field))
  const added: ListFilter[] = []
  if (picks.status && STATUS_CHOICES.includes(picks.status)) added.push({ field: 'status', op: 'equals', value: picks.status })
  if (picks.payment === 'paid') added.push({ field: 'paidAt', op: 'exists', value: 'true' })
  if (picks.payment === 'unpaid') added.push({ field: 'paidAt', op: 'exists', value: 'false' })
  if (picks.payment === 'refunded') added.push({ field: 'refundedTotal', op: 'greater_than', value: '0' })
  const from = validDay(picks.from)
  const to = validDay(picks.to)
  if (from) added.push({ field: 'createdAt', op: 'greater_than', value: from })
  if (to) added.push({ field: 'createdAt', op: 'less_than', value: addDays(to, 1) })
  return [...kept, ...added]
}
