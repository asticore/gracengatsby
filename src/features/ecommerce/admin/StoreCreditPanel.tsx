'use client'

import React, { useCallback, useState } from 'react'

type Entry = { id: number; direction?: string; amount?: number; balanceAfter?: number; reason?: string; createdAt?: string }
type Info = { user: { id: number; email?: string }; balanceCents: number; ledger: Entry[] }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150, #ddd)', padding: 12, marginBottom: 12 }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || 'Request failed.')
  return body
}

/**
 * Look up a customer by email, see their store credit balance and ledger, and add or deduct credit with a reason.
 * Shown on the Store credit balances screen. The reason is recorded in the credit ledger and shown to the customer.
 */
export function StoreCreditPanel() {
  const [email, setEmail] = useState('')
  const [info, setInfo] = useState<Info | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [direction, setDirection] = useState<'add' | 'deduct'>('add')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const lookup = useCallback(async (value: string) => {
    setError('')
    try {
      setInfo(await call<Info>(`/api/admin-store-credit?email=${encodeURIComponent(value)}`))
    } catch (e) {
      setInfo(null)
      setError(e instanceof Error ? e.message : 'Lookup failed.')
    }
  }, [])

  const submit = async () => {
    if (!info) return
    const cents = Math.round(Number(amount) * 100)
    if (!window.confirm(`${direction === 'add' ? 'Add' : 'Deduct'} ${money(cents)} ${direction === 'add' ? 'to' : 'from'} ${info.user.email}?`)) return
    setBusy(true)
    setError('')
    try {
      await call('/api/admin-store-credit', { method: 'POST', body: JSON.stringify({ userId: info.user.id, amountCents: cents, direction, reason }) })
      setAmount('')
      setReason('')
      await lookup(String(info.user.email))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="email" placeholder="Customer email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
        <button type="button" className="btn btn--style-secondary" disabled={!email.trim()} onClick={() => lookup(email)}>Find customer</button>
      </div>
      {info && (
        <>
          <p>
            {info.user.email}: balance <strong>{money(info.balanceCents)}</strong>
          </p>
          <div style={box}>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'deduct')}>
              <option value="add">Add credit</option>
              <option value="deduct">Deduct credit</option>
            </select>{' '}
            <label>Amount ($) <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>{' '}
            <label>Reason (required) <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
            <button type="button" className="btn btn--style-secondary" disabled={busy || !(Number(amount) > 0) || !reason.trim()} onClick={submit}>Save</button>
          </div>
          {info.ledger.map((l) => (
            <div key={l.id} style={box}>
              {l.direction === 'credit' ? '+' : '-'}
              {money(l.amount ?? 0)} - {l.reason || ''} - balance {money(l.balanceAfter ?? 0)} - {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}
            </div>
          ))}
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}
