'use client'

import React, { useCallback, useState } from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

type Entry = { id: number; direction?: string; amount?: number; balanceAfter?: number; reason?: string; createdAt?: string }
type Info = { user: { id: number; email?: string }; balanceCents: number; ledger: Entry[] }

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150, #ddd)', padding: 12, marginBottom: 12 }

async function call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || fallback)
  return body
}

/**
 * Look up a customer by email, see their store credit balance and ledger, and add or deduct credit with a reason.
 * Shown on the Store credit balances screen. The reason is recorded in the credit ledger and shown to the customer.
 */
export function StoreCreditPanel() {
  const t = useAdminT()
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
      setInfo(await call<Info>(`/api/admin-store-credit?email=${encodeURIComponent(value)}`, undefined, t('customers.credit.errRequest')))
    } catch (e) {
      setInfo(null)
      setError(e instanceof Error ? e.message : t('customers.credit.errLookup'))
    }
  }, [t])

  const submit = async () => {
    if (!info) return
    const cents = Math.round(Number(amount) * 100)
    if (!window.confirm(direction === 'add' ? t('customers.credit.confirmAdd', { amount: money(cents), email: String(info.user.email) }) : t('customers.credit.confirmDeduct', { amount: money(cents), email: String(info.user.email) }))) return
    setBusy(true)
    setError('')
    try {
      await call('/api/admin-store-credit', { method: 'POST', body: JSON.stringify({ userId: info.user.id, amountCents: cents, direction, reason }) }, t('customers.credit.errRequest'))
      setAmount('')
      setReason('')
      await lookup(String(info.user.email))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('customers.credit.errFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="email" placeholder={t('customers.credit.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
        <button type="button" className="btn btn--style-secondary" disabled={!email.trim()} onClick={() => lookup(email)}>{t('customers.credit.find')}</button>
      </div>
      {info && (
        <>
          <p>
            {t('customers.credit.balance', { email: String(info.user.email) })} <strong>{money(info.balanceCents)}</strong>
          </p>
          <div style={box}>
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'deduct')}>
              <option value="add">{t('customers.credit.add')}</option>
              <option value="deduct">{t('customers.credit.deduct')}</option>
            </select>{' '}
            <label>{t('customers.credit.amount')} <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>{' '}
            <label>{t('customers.credit.reason')} <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
            <button type="button" className="btn btn--style-secondary" disabled={busy || !(Number(amount) > 0) || !reason.trim()} onClick={submit}>{t('customers.credit.save')}</button>
          </div>
          {info.ledger.map((l) => (
            <div key={l.id} style={box}>
              {l.direction === 'credit' ? '+' : '-'}
              {t('customers.credit.ledger', { amount: money(l.amount ?? 0), reason: l.reason || '', balance: money(l.balanceAfter ?? 0), date: l.createdAt ? new Date(l.createdAt).toLocaleString() : '' })}
            </div>
          ))}
        </>
      )}
      {error && <p role="alert" style={{ color: 'var(--theme-error-500, #b00)' }}>{error}</p>}
    </div>
  )
}
