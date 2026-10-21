'use client'

import React, { useEffect, useState } from 'react'

type Starter = { id: string; kind: string; label: string; description: string }

const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

/** Start a site template from a ready-made layout: creates a disabled draft and links to the visual editor. */
export const StartersPanel: React.FC = () => {
  const [starters, setStarters] = useState<Starter[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: number | string; label: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin-template-starters', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load starters.'))))
      .then((d: { starters?: Starter[] }) => setStarters(d.starters ?? []))
      .catch((e: Error) => setError(e.message))
  }, [])

  const create = async (starter: Starter) => {
    setBusy(starter.id)
    setError('')
    try {
      const res = await fetch('/api/admin-template-starters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starterId: starter.id }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: number | string; error?: string }
      if (!res.ok || data.id === undefined) throw new Error(data.error || 'Could not create the template.')
      setCreated({ id: data.id, label: starter.label })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the template.')
    } finally {
      setBusy(null)
    }
  }

  if (!starters.length && !error) return null
  return (
    <div style={{ marginBottom: 8, maxWidth: 520 }}>
      <strong>Start from a layout</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {starters.map((s) => (
          <button key={s.id} type="button" className={buttonClass} title={s.description} disabled={busy !== null} onClick={() => void create(s)}>
            {busy === s.id ? 'Creating...' : `${s.kind}: ${s.label}`}
          </button>
        ))}
      </div>
      {created ? (
        <p style={{ marginTop: 6, fontSize: 13 }}>
          Draft &quot;{created.label}&quot; created (switched off).{' '}
          <a href={`/admin/visual-editor/collection/site-templates/${created.id}`}>Open in the visual editor</a>
        </p>
      ) : null}
      {error ? <p role="alert" style={{ marginTop: 6, fontSize: 13, color: '#b91c1c' }}>{error}</p> : null}
    </div>
  )
}
