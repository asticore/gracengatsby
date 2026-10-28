'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'

/** On/off switch for a site template in the hub table. Writes through the REST API, then refreshes the list. */
export const StatusSwitch: React.FC<{ id: number | string; name: string; on: boolean }> = ({ id, name, on: initial }) => {
  const router = useRouter()
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    const next = !on
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/site-templates/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error('Could not switch it. Try again.')
      setOn(next)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch it.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${on ? 'On' : 'Off'}: ${name}. Switch ${on ? 'off' : 'on'}`}
        disabled={busy}
        onClick={() => void toggle()}
        style={{ cursor: 'pointer', border: 0, background: on ? '#2e3192' : '#9a98a3', borderRadius: 999, width: 36, height: 20, position: 'relative', color: 'transparent' }}
      >
        <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff' }} />
      </button>
      <span>{on ? 'On' : 'Off'}</span>
      {error ? <span role="alert" style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span> : null}
    </span>
  )
}

export default StatusSwitch
