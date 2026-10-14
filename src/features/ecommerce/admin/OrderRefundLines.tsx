'use client'

import React from 'react'

import { type LineView } from './refundView'

export type LinePatch = { units?: string; amount?: string; restock?: boolean }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** One row per order line, plus a shipping row. Each row says what was paid and refunded so far. */
export function OrderRefundLines({
  lines,
  shipping,
  onLine,
  onShipping,
  disabled,
}: {
  lines: LineView[]
  shipping: { paid: number; refunded: number; left: number; value: string }
  onLine: (index: number, patch: LinePatch) => void
  onShipping: (value: string) => void
  disabled: boolean
}) {
  return (
    <table className="order-refunds__table">
      <thead>
        <tr>
          <th>Item</th>
          <th className="num">Paid</th>
          <th className="num">Refunded so far</th>
          <th className="num" title="How many of this item are being refunded. Leave at 0 to refund money only.">Units to refund</th>
          <th className="num" title="Money to give back for this line, in dollars. Includes its tax.">Amount to refund ($)</th>
          <th title="Put the refunded units back into stock. Only ticked lines are restocked.">Restock</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.index}>
            <td>{l.name} <span className="muted">(bought {l.quantity})</span></td>
            <td className="num">{money(l.paid)}</td>
            <td className="num">{money(l.doneAmount)}{l.doneUnits > 0 ? ` (${l.doneUnits} unit${l.doneUnits === 1 ? '' : 's'})` : ''}</td>
            <td className="num">
              <input type="number" min={0} max={l.unitsLeft} step={1} value={l.row.units} disabled={disabled || l.unitsLeft === 0} aria-label={`Units to refund for ${l.name}`} onChange={(e) => onLine(l.index, { units: e.target.value })} />
            </td>
            <td className="num">
              <input type="number" min={0} max={l.amountLeft / 100} step={0.01} value={l.row.amount} disabled={disabled || l.amountLeft === 0} aria-label={`Amount to refund for ${l.name}`} onChange={(e) => onLine(l.index, { amount: e.target.value })} />
            </td>
            <td>
              <input type="checkbox" checked={l.row.restock} disabled={disabled || l.unitsLeft === 0} aria-label={`Restock ${l.name}`} onChange={(e) => onLine(l.index, { restock: e.target.checked })} />
            </td>
          </tr>
        ))}
        {shipping.paid > 0 && (
          <tr>
            <td>Shipping</td>
            <td className="num">{money(shipping.paid)}</td>
            <td className="num">{money(shipping.refunded)}</td>
            <td className="num">-</td>
            <td className="num">
              <input type="number" min={0} max={shipping.left / 100} step={0.01} value={shipping.value} disabled={disabled || shipping.left === 0} aria-label="Shipping amount to refund" onChange={(e) => onShipping(e.target.value)} />
            </td>
            <td>-</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
