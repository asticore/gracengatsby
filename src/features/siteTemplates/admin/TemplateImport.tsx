'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import React, { useState } from 'react'

const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

/**
 * Import a site template from a JSON file (the Export format). Lives on the Templates hub only, next to the starters,
 * so each action has one home. The imported draft is created switched off.
 */
export const TemplateImport: React.FC = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ id: number | string; label: string } | null>(null)

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin-template-io', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: await file.text(),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: number | string; error?: string }
      if (!res.ok || data.id === undefined) throw new Error(data.error || 'Could not import the template.')
      setCreated({ id: data.id, label: file.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the template.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label className={buttonClass}>
        {busy ? 'Importing...' : 'Import template file'}
        <input type="file" accept=".json,application/json" hidden disabled={busy} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {created ? (
        <p style={{ margin: 0, fontSize: 13 }}>
          Draft &quot;{created.label}&quot; created (switched off).{' '}
          <AdminLink path={`/visual-editor/collection/site-templates/${created.id}`}>Open in the visual editor</AdminLink>
        </p>
      ) : null}
      {error ? <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p> : null}
    </div>
  )
}

export default TemplateImport
