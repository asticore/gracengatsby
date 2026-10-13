'use client'

import type { ListFilter, ListState } from '@/admin/list/listQuery'
import { ORDER_STATUS_LABELS, type OrderStatus } from '../lib/orderStatus'
import { EMPTY_ORDER_PICKS, PAYMENT_CHOICES, STATUS_CHOICES, applyOrderPicks, readOrderPicks, type OrderPicks, type PaymentChoice } from '../lib/orderFilters'
import './orders-filter-bar.css'

/** Status, payment and date-range filters for the orders list. Every change goes straight to the list. */
export function OrdersFilterBar({ state, onChange }: { state: ListState; onChange: (filters: ListFilter[]) => void }) {
  const picks = readOrderPicks(state.filters)
  const update = (patch: Partial<OrderPicks>) => onChange(applyOrderPicks(state.filters, { ...picks, ...patch }))
  const anyPick = picks.status !== '' || picks.payment !== 'any' || picks.from !== '' || picks.to !== ''

  return (
    <div className="orders-filter-bar" role="group" aria-label="Order filters">
      <label title="Only show orders with this status.">
        <span>Status</span>
        <select value={picks.status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Any status</option>
          {STATUS_CHOICES.map((value) => (
            <option key={value} value={value}>
              {ORDER_STATUS_LABELS[value as OrderStatus]}
            </option>
          ))}
        </select>
      </label>
      <label title={PAYMENT_CHOICES.find((c) => c.value === picks.payment)?.tooltip}>
        <span>Payment</span>
        <select value={picks.payment} onChange={(e) => update({ payment: e.target.value as PaymentChoice })}>
          {PAYMENT_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value} title={choice.tooltip}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      <label title="Show orders placed on or after this day. Days are in UTC.">
        <span>Placed from</span>
        <input type="date" value={picks.from} onChange={(e) => update({ from: e.target.value })} />
      </label>
      <label title="Show orders placed on or before this day. Days are in UTC.">
        <span>Placed to</span>
        <input type="date" value={picks.to} onChange={(e) => update({ to: e.target.value })} />
      </label>
      {anyPick && (
        <button type="button" className="orders-filter-clear" title="Remove the status, payment and date filters." onClick={() => onChange(applyOrderPicks(state.filters, EMPTY_ORDER_PICKS))}>
          Clear order filters
        </button>
      )}
    </div>
  )
}
