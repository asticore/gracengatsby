'use client'

import React, { useState } from 'react'
import { useFormFields } from '@/engine/ui'

import { socialRowId, socialTestMessage } from '../testResult'

/** "Test connection" button shown on each Social accounts row. Needs the row saved (has an id). */
export function TestConnectionField({ path }: { path: string }) {
  const rowPath = path.split('.').slice(0, -1).join('.')
  const rawId = useFormFields(([fields]) => fields?.[`${rowPath}.id`]?.value)
  const id = socialRowId(rawId)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async () => {
    if (id === null) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin-social-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setMsg(socialTestMessage(await res.json().catch((): null => null)))
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button type="button" className="btn btn--style-secondary btn--size-small" onClick={run} disabled={id === null || busy}>
        {busy ? 'Testing...' : 'Test connection'}
      </button>
      {id === null && <span style={{ marginLeft: 8, opacity: 0.7 }}>Save this page first to test a new account.</span>}
      {msg && (
        <span role="status" style={{ marginLeft: 8, color: msg.ok ? 'var(--theme-success-500, #2e7d32)' : 'var(--theme-error-500, #c62828)' }}>
          {msg.text}
        </span>
      )}
    </div>
  )
}
