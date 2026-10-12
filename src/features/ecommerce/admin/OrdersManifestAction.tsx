'use client'

import React, { useState } from 'react'

type Made = { number: string; totals: { orders: number; parcels: number }; htmlUrl: string; csvUrl: string }

/** Orders list toolbar: batch every labelled parcel not yet on a manifest into one driver manifest. */
export function OrdersManifestAction() {
  const [carrier, setCarrier] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Made | null>(null)

  const create = async () => {
    setBusy(true)
    setError('')
    setMade(null)
    try {
      const res = await fetch('/api/admin-shop-manifest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, carrier: carrier.trim() }),
      })
      const body = (await res.json().catch((): null => null)) as (Made & { error?: string }) | null
      if (!res.ok || !body) setError(body?.error || 'Could not create the manifest.')
      else setMade(body)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="list-toolbar-manifest">
      <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Carrier id (optional)" aria-label="Carrier id for the manifest" className="list-filter-value-input" />
      <button type="button" className="list-toolbar-btn" disabled={busy} onClick={create} title="Batch every labelled parcel that is not on a manifest yet">
        {busy ? 'Creating...' : 'Create manifest'}
      </button>
      {made && (
        <span role="status">
          {made.number}: {made.totals.parcels} parcel(s) -{' '}
          <a href={made.htmlUrl} target="_blank" rel="noopener noreferrer">Print</a> | <a href={made.csvUrl}>CSV</a>
        </span>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  )
}
