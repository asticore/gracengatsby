'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { useDocumentInfo } from '@/engine/ui'

type Note = { id: string; type: 'internal' | 'customer'; text: string; author: string; createdAt: string }
type Refund = { id: number; amount: number; reason?: string; method?: string; createdAt: string; providerRefundId?: string }
type RefundInfo = { refunds: Refund[]; amount: number; refundedTotal: number; status?: string; lineItems: { name?: string; quantity?: number }[]; canCardRefund: boolean }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150, #ddd)', padding: 12, marginBottom: 12 }

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

export function OrderNotesPanel() {
  const id = useOrderId()
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [type, setType] = useState<'internal' | 'customer'>('internal')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!id) return
    try {
      setNotes((await call<{ notes: Note[] }>(`/api/admin-order-notes/${id}`)).notes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notes.')
    }
  }, [id])
  useEffect(() => {
    if (!id) return
    call<{ notes: Note[] }>(`/api/admin-order-notes/${id}`)
      .then((r) => setNotes(r.notes))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load notes.'))
  }, [id])
  if (!id) return <p>Save the order first to add notes.</p>
  const add = async () => {
    setBusy(true); setError('')
    try {
      await call(`/api/admin-order-notes/${id}`, { method: 'POST', body: JSON.stringify({ text, type }) })
      setText(''); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.') } finally { setBusy(false) }
  }
  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      {notes.length === 0 && <p style={{ opacity: 0.7 }}>No notes yet.</p>}
      {[...notes].reverse().map((n) => (
        <div key={n.id} style={{ ...box, background: n.type === 'customer' ? 'var(--theme-success-50, #eef8ef)' : undefined }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{n.type === 'customer' ? 'Note to customer' : 'Internal note'} - {n.author} - {new Date(n.createdAt).toLocaleString()}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
        </div>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={{ width: '100%' }} placeholder="Add a note" />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <select value={type} onChange={(e) => setType(e.target.value as 'internal' | 'customer')}>
          <option value="internal">Internal note</option>
          <option value="customer">Note to customer (emailed)</option>
        </select>
        <button type="button" className="btn btn--style-secondary" disabled={busy || !text.trim()} onClick={add}>Add note</button>
      </div>
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}

export function OrderRefundsPanel() {
  const id = useOrderId()
  const [info, setInfo] = useState<RefundInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(false)
  const [manual, setManual] = useState(false)
  const [lineQty, setLineQty] = useState<Record<number, number>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    if (!id) return
    try { setInfo(await call<RefundInfo>(`/api/admin-order-refund/${id}`)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not load refunds.') }
  }, [id])
  useEffect(() => {
    if (!id) return
    call<RefundInfo>(`/api/admin-order-refund/${id}`)
      .then((r) => setInfo(r))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load refunds.'))
  }, [id])
  if (!id) return <p>Save the order first.</p>
  const left = info ? Math.max(0, info.amount - info.refundedTotal) : 0
  const submit = async (full: boolean) => {
    const cents = full ? left : Math.round(Number(amount) * 100)
    if (!window.confirm(`Refund ${money(cents)}${manual ? ' (record only)' : ''}? This cannot be undone.`)) return
    setBusy(true); setError('')
    try {
      const items = Object.entries(lineQty).filter(([, q]) => q > 0).map(([index, quantity]) => ({ index: Number(index), quantity }))
      await call(`/api/admin-order-refund/${id}`, { method: 'POST', body: JSON.stringify({ amountCents: cents, reason, restock, manual: manual || !info?.canCardRefund, items }) })
      setAmount(''); setReason(''); setLineQty({}); await load()
      window.location.reload()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.') } finally { setBusy(false) }
  }
  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      {info && (
        <>
          <p>Paid {money(info.amount)} - refunded {money(info.refundedTotal)} - left to refund <strong>{money(left)}</strong></p>
          {info.refunds.map((r) => (
            <div key={r.id} style={box}>{money(r.amount)} - {r.method === 'manual' || !r.providerRefundId ? 'manual' : 'card'} - {new Date(r.createdAt).toLocaleString()}{r.reason ? ` - ${r.reason}` : ''}</div>
          ))}
          {left > 0 && (
            <div style={box}>
              <label>Amount ($) <input type="number" min="0.01" step="0.01" max={left / 100} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>{' '}
              <label>Reason <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
              {info.lineItems.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {info.lineItems.map((l, i) => (
                    <div key={i}>{l.name} x {l.quantity}{' '}
                      <input type="number" min={0} max={l.quantity} value={lineQty[i] ?? 0} style={{ width: 60 }} onChange={(e) => setLineQty({ ...lineQty, [i]: Number(e.target.value) })} /> to refund</div>
                  ))}
                </div>
              )}
              <label style={{ display: 'block', marginTop: 8 }}><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Restock refunded items</label>
              <label style={{ display: 'block' }}><input type="checkbox" checked={manual || !info.canCardRefund} disabled={!info.canCardRefund} onChange={(e) => setManual(e.target.checked)} /> Manual refund (record only, no card refund)</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn btn--style-secondary" disabled={busy || !(Number(amount) > 0)} onClick={() => submit(false)}>Refund amount</button>
                <button type="button" className="btn btn--style-secondary" disabled={busy} onClick={() => submit(true)}>Refund everything left</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}

export function OrderInvoicePanel() {
  const id = useOrderId()
  if (!id) return <p>Save the order first.</p>
  return (
    <div className="field-type" style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
      <a className="btn btn--style-secondary" href={`/api/admin-order-invoice/${id}`} target="_blank" rel="noopener">View / print invoice</a>
      <a className="btn btn--style-secondary" href={`/api/admin-order-packing-slip/${id}`} target="_blank" rel="noopener">View / print packing slip</a>
    </div>
  )
}
