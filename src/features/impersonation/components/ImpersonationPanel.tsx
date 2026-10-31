'use client'

import { useState, type FormEvent } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { SortableTable } from '@/admin/table/SortableTable'
import type { UiStringKey } from '@/features/uiStrings'

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

const STATUS_KEYS: Record<HistoryEntry['status'], UiStringKey> = { active: 'us.lit.status_active', ended: 'us.lit.status_ended', expired: 'us.lit.status_expired' }

const when = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '-')

export function ImpersonationPanel({ enabled, maxMinutes, requireTwoFactor, entries }: Props) {
  const t = useAdminT()
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
        <h2 id="imp-start">{t('us.lit.sign_in_as_a_customer')}</h2>
        {!enabled ? (
          <p>{t('us.lit.signing_in_switched_off')}</p>
        ) : (
          <>
            <p>
              {t('us.lit.imp_intro', { minutes: maxMinutes })}
              {requireTwoFactor ? (
                <>
                  {' '}
                  {t('us.lit.imp_requires_2fa')}
                </>
              ) : null}
            </p>
            <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
              <label style={{ display: 'grid', gap: 4 }}>
                {t('us.lit.customer_email')}
                <input name="email" type="email" required autoComplete="off" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                {t('us.lit.reason_min_5')}
                <textarea name="reason" required minLength={5} maxLength={300} rows={2} />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                {t('us.lit.your_password')}
                <input name="password" type="password" autoComplete="current-password" />
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                {t('us.lit.or_authenticator_code')}
                <input name="code" inputMode="numeric" autoComplete="one-time-code" />
              </label>
              <div>
                <button type="submit" disabled={busy}>
                  {busy ? t('us.lit.starting') : t('us.lit.sign_in_as_customer')}
                </button>
              </div>
              {message ? <p role="alert">{message}</p> : null}
            </form>
          </>
        )}
      </section>

      <section aria-labelledby="imp-history">
        <h2 id="imp-history">{t('us.lit.history')}</h2>
        {entries.length === 0 ? (
          <p>{t('us.lit.no_one_signed_in_yet')}</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <SortableTable
              columns={[
                { key: 'started', label: t('us.lit.started') },
                { key: 'admin', label: t('us.lit.admin') },
                { key: 'customer', label: t('us.lit.customer') },
                { key: 'reason', label: t('us.lit.reason') },
                { key: 'status', label: t('us.lit.status') },
                { key: 'ended', label: t('us.lit.ended') },
              ]}
              rows={entries.map((entry) => ({
                id: String(entry.id),
                sortValues: {
                  started: new Date(entry.startedAt).getTime(),
                  admin: entry.adminEmail,
                  customer: entry.targetEmail,
                  reason: entry.reason,
                  status: t(STATUS_KEYS[entry.status]),
                  ended: entry.endedAt ? new Date(entry.endedAt).getTime() : null,
                },
                cells: {
                  started: when(entry.startedAt),
                  admin: entry.adminEmail,
                  customer: entry.targetEmail,
                  reason: entry.reason,
                  status: t(STATUS_KEYS[entry.status]),
                  ended: when(entry.endedAt),
                },
              }))}
            />
          </div>
        )}
      </section>
    </div>
  )
}
