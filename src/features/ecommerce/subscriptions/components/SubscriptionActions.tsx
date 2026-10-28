'use client'

import React, { useState } from 'react'

import type { SubscriptionStatus } from '../plan'
import { usePortalText } from '@/features/accounts/components/PortalText'

const OPTIONS: { action: 'pause' | 'resume' | 'cancel' | 'keep'; labelKey: 'subscriptions.pause' | 'subscriptions.resume' | 'subscriptions.cancel' | 'subscriptions.keep'; from: SubscriptionStatus[] }[] = [
  { action: 'pause', labelKey: 'subscriptions.pause', from: ['active', 'trialing'] },
  { action: 'resume', labelKey: 'subscriptions.resume', from: ['paused'] },
  { action: 'cancel', labelKey: 'subscriptions.cancel', from: ['active', 'trialing', 'past-due', 'paused'] },
  { action: 'keep', labelKey: 'subscriptions.keep', from: ['cancelling'] },
]

/** Buttons for one subscription row. Only the changes that apply to its status are shown. */
export function SubscriptionActions({ id, status }: { id: number; status: SubscriptionStatus }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const available = OPTIONS.filter((option) => option.from.includes(status))
  const t = usePortalText()

  const change = async (action: (typeof OPTIONS)[number]['action']) => {
    if (action === 'cancel' && !window.confirm(t('subscriptions.confirmCancel'))) return
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
      if (!res.ok) throw new Error(body.error || t('subscriptions.notMade'))
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('subscriptions.notMade'))
      setBusy(false)
    }
  }

  if (available.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {available.map((option) => (
        <button key={option.action} type="button" className="btn btn--style-secondary" disabled={busy} onClick={() => change(option.action)}>
          {t(option.labelKey)}
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
