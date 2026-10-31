'use client'

import React, { useEffect, useState } from 'react'

import type { BlockContext } from '@/lib/blockContext'
import { sampleCollectionFor } from '@/lib/blockContextFrom'

type Audience = '' | 'guests' | 'members'

/**
 * "Preview as": picks a real item (single, archive and sidebar kinds) and an audience (guest or member) so the
 * template's widgets show sample text on the canvas. Nothing is saved. Every site template kind has the audience
 * choice; only kinds with a sample collection also list items.
 */
export const PreviewAsPicker: React.FC<{ kind: unknown; onContext: (ctx: BlockContext | null) => void }> = ({ kind, onContext }) => {
  const collection = sampleCollectionFor(kind)
  const [items, setItems] = useState<Array<{ id: number | string; title: string }>>([])
  const [picked, setPicked] = useState('')
  const [audience, setAudience] = useState<Audience>('')
  const [itemContext, setItemContext] = useState<BlockContext | null>(null)
  const [error, setError] = useState('')

  // Sends the combined preview: the picked item's context plus the audience, or null when neither is set.
  const emit = (ctx: BlockContext | null, aud: Audience) => {
    if (!ctx && !aud) return onContext(null)
    onContext({ ...(ctx ?? {}), ...(aud ? { audience: aud } : {}) })
  }

  useEffect(() => {
    if (!collection) return
    let live = true
    fetch(`/api/admin-template-sample?kind=${encodeURIComponent(String(kind))}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load samples'))))
      .then((d: { items?: Array<{ id: number | string; title: string }> }) => live && setItems(d.items ?? []))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [kind, collection])

  const choose = (id: string) => {
    setPicked(id)
    setError('')
    if (!id) {
      setItemContext(null)
      return emit(null, audience)
    }
    fetch(`/api/admin-template-sample?kind=${encodeURIComponent(String(kind))}&id=${encodeURIComponent(id)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load that item'))))
      .then((d: { context?: BlockContext }) => {
        setItemContext(d.context ?? null)
        emit(d.context ?? null, audience)
      })
      .catch((e: Error) => setError(e.message))
  }

  const chooseAudience = (value: Audience) => {
    setAudience(value)
    emit(itemContext, value)
  }

  return (
    <span className="ve-preview-as-group">
      {collection ? (
        <label className="ve-preview-as">
          <span className="ve-preview-as__label">Preview as</span>
          <select className="ve-preview-as__select" value={picked} onChange={(e) => choose(e.target.value)}>
            <option value="">No sample (placeholders)</option>
            {items.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.title}
              </option>
            ))}
          </select>
          {error ? <span role="alert" className="ve-preview-as__error">{error}</span> : null}
        </label>
      ) : null}
      <label className="ve-preview-as">
        <span className="ve-preview-as__label">Audience</span>
        <select className="ve-preview-as__select" aria-label="Preview audience" value={audience} onChange={(e) => chooseAudience(e.target.value as Audience)}>
          <option value="">Any visitor</option>
          <option value="guests">Guest (not signed in)</option>
          <option value="members">Member (signed in)</option>
        </select>
      </label>
    </span>
  )
}
