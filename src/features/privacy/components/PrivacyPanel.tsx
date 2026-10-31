'use client'

import React, { useState, useTransition } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings/keys'
import { approvePrivacyAction, erasePrivacyAction, loadPrivacyAction, rejectPrivacyAction, type PrivacyActionResult, type PrivacyData } from '../actions'
import { PRIVACY_STATUS_LABEL_KEYS } from '../core'

/**
 * The admin privacy requests list: status, the 30-day deadline and the actions a status allows.
 * Each button calls a server action that re-checks the session and the `privacy` permission.
 */

export const PrivacyPanel: React.FC<{ initial: PrivacyData }> = ({ initial }) => {
  const t = useAdminT()
  const [data, setData] = useState<PrivacyData>(initial)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const reload = async () => {
    const next = await loadPrivacyAction()
    if (next.ok === true && next.value) setData(next.value)
  }

  const run = (
    action: () => Promise<PrivacyActionResult<unknown>>,
    done: UiStringKey,
    confirmText?: UiStringKey,
  ) => {
    if (confirmText && !window.confirm(t(confirmText))) return
    startTransition(async () => {
      const result = await action()
      setMessage(result.ok === true ? t(done) : result.error)
      await reload()
    })
  }

  return (
    <div style={{ maxWidth: 980, padding: '1.5rem' }}>
      <h1>{t('privacy.admin.title')}</h1>
      <p>{t('privacy.admin.intro')}</p>
      {!data.canEdit ? <p>{t('privacy.admin.readOnly')}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <p>
        <button type="button" onClick={() => startTransition(reload)} disabled={busy}>
          {t('privacy.admin.refresh')}
        </button>
      </p>
      {data.requests.length === 0 ? (
        <p>{t('privacy.admin.none')}</p>
      ) : (
        <table className="eg-table">
          <thead>
            <tr>
              <th>{t('privacy.admin.columns.email')}</th>
              <th>{t('privacy.admin.columns.status')}</th>
              <th>{t('privacy.admin.columns.requested')}</th>
              <th>{t('privacy.admin.columns.due')}</th>
              <th>{t('privacy.admin.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data.requests.map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>
                  {t(PRIVACY_STATUS_LABEL_KEYS[r.status])}
                  {r.overdue ? ` (${t('privacy.admin.overdue')})` : ''}
                  {r.result ? <div>{t('privacy.admin.result', { orders: r.result.orders ?? 0, addresses: r.result.addresses ?? 0, sessions: r.result.sessions ?? 0 })}</div> : null}
                </td>
                <td>{r.createdAt.slice(0, 10)}</td>
                <td>{r.status === 'done' || r.status === 'rejected' ? '-' : r.dueAt.slice(0, 10)}</td>
                <td>
                  {data.canEdit && r.status === 'new' ? (
                    <>
                      <button type="button" disabled={busy} onClick={() => run(() => approvePrivacyAction(r.id), 'privacy.admin.approved')}>
                        {t('privacy.admin.approve')}
                      </button>{' '}
                      <button type="button" disabled={busy} onClick={() => run(() => rejectPrivacyAction(r.id), 'privacy.admin.rejected', 'privacy.admin.rejectConfirm')}>
                        {t('privacy.admin.reject')}
                      </button>
                    </>
                  ) : null}
                  {data.canEdit && r.status === 'in_progress' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => erasePrivacyAction(r.id), 'privacy.admin.erased', 'privacy.admin.eraseConfirm')}
                      >
                        {t('privacy.admin.erase')}
                      </button>{' '}
                      <button type="button" disabled={busy} onClick={() => run(() => rejectPrivacyAction(r.id), 'privacy.admin.rejected', 'privacy.admin.rejectConfirm')}>
                        {t('privacy.admin.reject')}
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
