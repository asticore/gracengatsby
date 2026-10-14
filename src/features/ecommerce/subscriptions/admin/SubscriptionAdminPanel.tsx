'use client'

import React, { useState } from 'react'
import { useDocumentInfo, useField } from '@/engine/ui'

import { SUBSCRIPTION_STATUS_LABELS, type SubscriptionStatus } from '../plan'

/**
 * Pause, resume and cancel buttons on a subscription's edit screen. Only the ones that make sense for
 * the current status are enabled; the server checks the same rules again (manage.ts).
 */

const ALLOWED: Record<'cancel' | 'keep' | 'pause' | 'resume', SubscriptionStatus[]> = {
  cancel: ['active', 'trialing', 'past-due', 'paused'],
  keep: ['cancelling'],
  pause: ['active', 'trialing'],
  resume: ['paused'],
}

const LABELS = { cancel: 'Cancel at period end', keep: 'Undo cancellation', pause: 'Pause payments', resume: 'Resume payments' } as const

export function SubscriptionAdminPanel() {
  const { id } = useDocumentInfo()
  const { value } = useField<string>({ path: 'status' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const status = (value ?? 'incomplete') as SubscriptionStatus

  const act = async (action: keyof typeof LABELS) => {
    if (!id) return
    if (action === 'cancel' && !window.confirm('Cancel this subscription? It will end at the end of the period already paid for.')) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(`/api/admin-shop-subscription/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = (await res.json().catch((): Record<string, unknown> => ({}))) as { error?: string; status?: string }
      if (!res.ok) throw new Error(body.error || 'The change was not made.')
      setMessage('Saved. Reloading the details.')
      window.location.reload()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The change was not made.')
      setBusy(false)
    }
  }

  return (
    <div className="field-type">
      <p style={{ margin: '0 0 8px' }} title="Where the subscription is now. Kept up to date from Stripe.">
        Status: <strong>{SUBSCRIPTION_STATUS_LABELS[status] ?? status}</strong>
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((action) => (
          <button key={action} type="button" className="btn btn--style-secondary" disabled={busy || !id || !ALLOWED[action].includes(status)} onClick={() => act(action)}>
            {LABELS[action]}
          </button>
        ))}
      </div>
      {message ? <p style={{ fontSize: 13, margin: '8px 0 0' }}>{message}</p> : null}
    </div>
  )
}
