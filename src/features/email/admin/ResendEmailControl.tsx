'use client'

import React, { useState } from 'react'
import { useDocumentInfo } from '@/engine/ui'

/**
 * The Resend button on an email log entry's edit screen. Asks the server to
 * send the stored message again. The server decides whether it can (see
 * resendRefusal in src/features/email/emailLog.ts) and says why when it cannot.
 */
export const ResendEmailControl: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!id || collectionSlug !== 'email-log') return null

  const resend = async () => {
    if (!window.confirm('Send this email again to the same recipient?')) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin-email-resend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const body = (await res.json().catch((): null => null)) as { error?: string } | null
      setMessage(res.ok ? 'Sent again. The new send appears in the email log.' : body?.error || 'Could not send it again.')
    } catch {
      setMessage('Could not send it again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '0 32px', marginBottom: 8, fontSize: 13 }} data-testid="email-resend">
      <button type="button" onClick={resend} disabled={busy}>
        {busy ? 'Sending...' : 'Resend'}
      </button>
      {message && (
        <span role="status" style={{ marginLeft: 12 }}>
          {message}
        </span>
      )}
    </div>
  )
}
