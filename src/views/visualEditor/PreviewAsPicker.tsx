'use client'

import React, { useEffect, useState } from 'react'

import type { BlockContext } from '@/lib/blockContext'
import { sampleCollectionFor } from '@/lib/blockContextFrom'

/** "Preview as": picks a real item so the template's data widgets show its text on the canvas. Nothing is saved. */
export const PreviewAsPicker: React.FC<{ kind: unknown; onContext: (ctx: BlockContext | null) => void }> = ({ kind, onContext }) => {
  const [items, setItems] = useState<Array<{ id: number | string; title: string }>>([])
  const [picked, setPicked] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sampleCollectionFor(kind)) return
    let live = true
    fetch(`/api/admin-template-sample?kind=${encodeURIComponent(String(kind))}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load samples'))))
      .then((d: { items?: Array<{ id: number | string; title: string }> }) => live && setItems(d.items ?? []))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [kind])

  if (!sampleCollectionFor(kind)) return null

  const choose = (id: string) => {
    setPicked(id)
    setError('')
    if (!id) return onContext(null)
    fetch(`/api/admin-template-sample?kind=${encodeURIComponent(String(kind))}&id=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load that item'))))
      .then((d: { context?: BlockContext }) => onContext(d.context ?? null))
      .catch((e: Error) => setError(e.message))
  }

  return (
    <label style={{ display: 'block', margin: '8px 0' }}>
      <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Preview as</span>
      <select value={picked} onChange={(e) => choose(e.target.value)} style={{ width: '100%' }}>
        <option value="">No sample (placeholders)</option>
        {items.map((i) => (
          <option key={i.id} value={String(i.id)}>
            {i.title}
          </option>
        ))}
      </select>
      {error ? <span role="alert" style={{ color: 'crimson' }}>{error}</span> : null}
    </label>
  )
}
