'use client'

import React, { useEffect, useState } from 'react'

import { MACHINE_PROVIDER_LABELS, MACHINE_PROVIDER_IDS, type MachineProviderId } from '../machine/providers'

type Status = { usedChars: number; monthlyCharLimit: number; keys: Record<MachineProviderId, boolean> }

const ENDPOINT = '/api/admin-machine-translation'

/**
 * Shown under the machine translation settings on the Languages screen: this month's
 * character usage against the limit, which keys are set, and a Test connection button.
 * It reads presence and counts only; no key ever reaches the browser.
 */
export function MachineTranslationField() {
  const [status, setStatus] = useState<Status | null>(null)
  const [provider, setProvider] = useState<MachineProviderId>('google')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    fetch(ENDPOINT)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => setStatus((data as Status | null) ?? null))
      .catch(() => setStatus(null))
  }, [])

  const test = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = (await res.json().catch((): null => null)) as { ok?: boolean; message?: string; error?: string } | null
      setMsg(data?.ok ? { ok: true, text: data.message ?? 'Connected.' } : { ok: false, text: data?.error ?? 'Test failed.' })
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {status ? (
        <p style={{ margin: '0 0 8px' }}>
          Usage this month: {status.usedChars.toLocaleString()} characters
          {status.monthlyCharLimit > 0 ? ` of ${status.monthlyCharLimit.toLocaleString()}` : ' (no limit set)'}.
          {' '}Keys set: {MACHINE_PROVIDER_IDS.filter((id) => status.keys[id]).map((id) => MACHINE_PROVIDER_LABELS[id]).join(', ') || 'none'}.
        </p>
      ) : null}
      <label style={{ marginRight: 8 }}>
        Provider to test{' '}
        <select value={provider} onChange={(event) => setProvider(event.target.value as MachineProviderId)}>
          {MACHINE_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {MACHINE_PROVIDER_LABELS[id]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn--style-secondary btn--size-small" onClick={test} disabled={busy}>
        {busy ? 'Testing...' : 'Test connection'}
      </button>
      {msg && (
        <span role="status" style={{ marginLeft: 8, color: msg.ok ? 'var(--theme-success-500, #2e7d32)' : 'var(--theme-error-500, #c62828)' }}>
          {msg.text}
        </span>
      )}
    </div>
  )
}
