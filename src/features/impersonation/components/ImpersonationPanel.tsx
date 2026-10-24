'use client'

import { useState, type FormEvent } from 'react'

import { startImpersonationAction } from '../actions'
import type { HistoryEntry } from '../service'

/**
 * The admin's "sign in as customer" form, and the history table below it. The
 * form asks for the customer's email, a reason, and a fresh password or
 * authenticator code. The server checks all of it again; nothing here is trusted.
 */

type Props = {
  enabled: boolean
  maxMinutes: number
  requireTwoFactor: boolean
  entries: HistoryEntry[]
}

const STATUS_LABEL: Record<HistoryEntry['status'], string> = { active: 'Active', ended: 'Ended', expired: 'Expired' }

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '-')

export function ImpersonationPanel({ enabled, maxMinutes, requireTwoFactor, entries }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage(null)
    const result = await startImpersonationAction({
      email: String(form.get('email') ?? ''),
      reason: String(form.get('reason') ?? ''),
      password: String(form.get('password') ?? '') || undefined,
      code: String(form.get('code') ?? '') || undefined,
    })
    if (result.ok && result.redirectTo) {
      window.location.assign(result.redirectTo)
      return
    }
    setBusy(false)
    setMessage(result.message)
  }

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <section aria-labelledby="imp-start">
        <h2 id="imp-start">Sign in as a customer</h2>
        {!enabled ? (
          <p>Signing in as a customer is switched off. The site owner can turn it on under Security settings.</p>
        ) : (
          <>
            <p>
              You will see the site as this customer, for up to {maxMinutes} minutes. You cannot change their password, email, two-step sign-in,
              passkeys, API keys or sessions, and you cannot place or pay for an order. Everything is recorded.
              {requireTwoFactor ? ' Your own account must have two-step sign-in or a passkey.' : ''}
            </p>
            <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                Customer email
                <input name="email" type="email" required autoComplete="off" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                Reason (at least 5 characters)
                <textarea name="reason" required minLength={5} maxLength={300} rows={2} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                Your password
                <input name="password" type="password" autoComplete="current-password" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                Or your authenticator code
                <input name="code" inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <div>
                <button type="submit" disabled={busy}>
                  {busy ? 'Starting...' : 'Sign in as customer'}
                </button>
              </div>
              {message ? <p role="alert">{message}</p> : null}
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="imp-history">
        <h2 id="imp-history">History</h2>
        {entries.length === 0 ? (
          <p>No one has signed in as a customer yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Admin</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Status</th>
                  <th scope="col">Ended</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{when(entry.startedAt)}</td>
                    <td>{entry.adminEmail}</td>
                    <td>{entry.targetEmail}</td>
                    <td>{entry.reason}</td>
                    <td>{STATUS_LABEL[entry.status]}</td>
                    <td>{when(entry.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
