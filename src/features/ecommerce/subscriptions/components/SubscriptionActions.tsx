'use client'

import React, { useState } from 'react'

import type { SubscriptionStatus } from '../plan'

const OPTIONS: { action: 'pause' | 'resume' | 'cancel' | 'keep'; label: string; from: SubscriptionStatus[] }[] = [
  { action: 'pause', label: 'Pause', from: ['active', 'trialing'] },
  { action: 'resume', label: 'Resume', from: ['paused'] },
  { action: 'cancel', label: 'Cancel', from: ['active', 'trialing', 'past-due', 'paused'] },
  { action: 'keep', label: 'Keep it', from: ['cancelling'] },
]

/** Buttons for one subscription row. Only the changes that apply to its status are shown. */
export function SubscriptionActions({ id, status }: { id: number; status: SubscriptionStatus }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = OPTIONS.filter((option) => option.from.includes(status))

  const change = async (action: (typeof OPTIONS)[number]['action']) => {
    if (action === 'cancel' && !window.confirm('Cancel this subscription? It ends at the end of the period you have already paid for.')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/shop-subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      })
      const body = (await res.json().catch((): Record<string, unknown> => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'That change was not made.')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change was not made.')
      setBusy(false)
    }
  }

  if (available.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {available.map((option) => (
        <button key={option.action} type="button" className="btn btn--style-secondary" disabled={busy} onClick={() => change(option.action)}>
          {option.label}
        </button>
      ))}
      {error ? (
        <span role="alert" style={{ color: 'var(--theme-error-500, #b42318)', fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
