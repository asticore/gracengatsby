'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

import { usePortalText } from '@/features/accounts/components/PortalText'

import { unlinkSocialAction } from '../actions'
import type { ConnectionView } from '../connections'

/**
 * Connected accounts, for the customer profile and the admin security screen.
 * Connecting is a plain link to the start route (mode=link); disconnecting is a
 * server action that refuses to remove the last way to sign in.
 */
export const ConnectedAccountsPanel: React.FC<{
  view: ConnectionView
  area: 'account' | 'admin'
  returnTo: string
  notice?: string
}> = ({ view, area, returnTo, notice }) => {
  const router = useRouter()
  const tx = usePortalText()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(notice ? { ok: false, text: notice } : null)

  const unlink = async (provider: string) => {
    setBusy(true)
    setMessage(null)
    const result = await unlinkSocialAction(provider)
    setBusy(false)
    setMessage({ ok: result.ok, text: result.message })
    if (result.ok) router.refresh()
  }

  if (view.linked.length === 0 && view.available.length === 0) {
    return <p>{tx('social.noProviders')}</p>
  }

  return (
    <div data-testid="connected-accounts">
      {message && (
        <p role="status" className={`account-note account-note--${message.ok ? 'success' : 'error'}`}>
          {message.text}
        </p>
      )}
      {view.linked.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {view.linked.map((row) => (
            <li key={row.provider} style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
              <span>
                <strong>{row.label}</strong>
                {row.email ? ` (${row.email})` : ''}
              </span>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => unlink(row.provider)}>
                {tx('common.disconnect')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.linked.length > 0 && !view.hasPassword && (
        <p className="account-note">{tx('social.noPasswordYet')}</p>
      )}
      {view.available.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {view.available.map((p) => (
            <a
              key={p.id}
              className="btn btn--ghost"
              href={`/api/social/${p.id}/start?mode=link&area=${area}&next=${encodeURIComponent(returnTo)}`}
            >
              {tx('common.connect', { provider: p.label })}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
