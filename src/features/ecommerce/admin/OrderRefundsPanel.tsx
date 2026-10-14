'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { useDocumentInfo } from '@/engine/ui'

import { OrderRefundLines } from './OrderRefundLines'
import './order-refunds.css'
import { EMPTY_ROW, buildLineViews, selectedRefund, toCents, type LineRow, type RefundInfo } from './refundView'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

function useOrderId(): string | null {
  const { id } = useDocumentInfo()
  return id ? String(id) : null
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || 'Request failed.')
  return body
}

/** Refunds for one order: pick lines (and shipping) to refund, or refund a custom amount or everything left. */
export function OrderRefundsPanel() {
  const id = useOrderId()
  const [info, setInfo] = useState<RefundInfo | null>(null)
  const [rows, setRows] = useState<Record<number, LineRow>>({})
  const [shipping, setShipping] = useState('')
  const [reason, setReason] = useState('')
  const [manual, setManual] = useState(false)
  const [toCredit, setToCredit] = useState(false)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    call<RefundInfo>(`/api/admin-order-refund/${id}`)
      .then((r) => setInfo(r))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load refunds.'))
  }, [id])

  if (!id) return <p>Save the order first.</p>

  const left = info ? Math.max(0, info.amount - info.refundedTotal) : 0
  const lines = info ? buildLineViews(info, rows) : []
  const shippingLeft = info ? Math.max(0, info.shippingTotal - info.shippingRefunded) : 0
  const picked = selectedRefund(lines, shipping)
  const method = { manual: !toCredit && (manual || !info?.canCardRefund), toStoreCredit: toCredit }
  const suffix = toCredit ? ' to store credit' : method.manual ? ' (record only)' : ''

  const send = async (body: Record<string, unknown>, cents: number) => {
    if (!window.confirm(`Refund ${money(cents)}${suffix}? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    try {
      await call(`/api/admin-order-refund/${id}`, { method: 'POST', body: JSON.stringify({ ...body, reason, ...method }) })
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The refund failed.')
      setBusy(false)
    }
  }

  const refundSelected = () =>
    send({ lines: picked.lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity, amount: l.amount, restock: l.restock })), shippingCents: picked.shippingCents }, picked.total)

  return (
    <div className="order-refunds">
      {info && (
        <>
          <p>Paid {money(info.amount)} - refunded {money(info.refundedTotal)} - left to refund <strong>{money(left)}</strong></p>
          {info.refunds.length > 0 && (
            <ul>
              {info.refunds.map((r) => (
                <li key={r.id}>
                  {money(r.amount)} - {r.method === 'manual' || !r.providerRefundId ? 'manual' : 'card'} - {new Date(r.createdAt).toLocaleString()}{r.reason ? ` - ${r.reason}` : ''}
                </li>
              ))}
            </ul>
          )}
          {left > 0 && (
            <>
              <OrderRefundLines
                lines={lines}
                shipping={{ paid: info.shippingTotal, refunded: info.shippingRefunded, left: shippingLeft, value: shipping }}
                disabled={busy}
                onLine={(i, patch) => setRows({ ...rows, [i]: { ...(rows[i] ?? EMPTY_ROW), ...patch } })}
                onShipping={setShipping}
              />
              <p className="order-refunds__total">This refund: {money(picked.total)}</p>
              <div className="order-refunds__options">
                <label>Reason <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
                <label title="Record the refund without moving money. Use it when you refunded outside the shop.">
                  <input type="checkbox" checked={method.manual} disabled={!info.canCardRefund || toCredit} onChange={(e) => setManual(e.target.checked)} /> Manual refund (record only, no card refund)
                </label>
                {info.canStoreCredit && (
                  <label><input type="checkbox" checked={toCredit} onChange={(e) => setToCredit(e.target.checked)} /> Refund to the customer&apos;s store credit instead of the card</label>
                )}
              </div>
              <div className="order-refunds__actions">
                <button type="button" className="btn btn--style-secondary" disabled={busy || picked.total <= 0} onClick={refundSelected}>Refund selected</button>
                <button type="button" className="btn btn--style-secondary" disabled={busy} onClick={() => send({ amountCents: left }, left)}>Refund everything left</button>
              </div>
              <details>
                <summary>Refund a custom amount</summary>
                <div className="order-refunds__actions">
                  <label>Amount ($) <input type="number" min="0.01" step="0.01" max={left / 100} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
                  <button type="button" className="btn btn--style-secondary" disabled={busy || toCents(custom) <= 0} onClick={() => send({ amountCents: toCents(custom) }, toCents(custom))}>Refund custom amount</button>
                </div>
              </details>
            </>
          )}
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}
