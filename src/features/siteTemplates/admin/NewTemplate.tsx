'use client'

import { useAdminHref } from '@/admin/adminRoute/AdminRouteProvider'
import React, { useEffect, useState } from 'react'

import { KIND_LABELS, SITE_TEMPLATE_KINDS, type SiteTemplateKind } from '../kinds'

export type TemplateStarter = { id: string; kind: SiteTemplateKind; label: string; description: string }

export const templateButtonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit no-underline hover:border-[#2e3192] disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'rounded-[6px] border border-[var(--theme-elevation-150,#cac7d1)] p-[12px]'

/** The visual builder entry for a site template. */
/** Admin path (relative to the admin root) of a site template in the visual editor. */
export const siteTemplateEditorPath = (id: number | string) => `/visual-editor/collection/site-templates/${id}`

/**
 * New site template: type, starter (or Blank), then create the draft and open it in the visual builder.
 * Used by the Templates hub. Starters come from /api/admin-template-starters.
 */
export const NewTemplate: React.FC<{ initialKind: SiteTemplateKind; onClose: () => void }> = ({ initialKind, onClose }) => {
  const [starters, setStarters] = useState<TemplateStarter[]>([])
  const [kind, setKind] = useState<SiteTemplateKind>(initialKind)
  const [starterId, setStarterId] = useState<string>('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const forKind = starters.filter((s) => s.kind === kind)
  // Header and footer default to the whole site. Other kinds default to everywhere for their type.
  const rule = kind === 'header' || kind === 'footer' ? 'Entire site' : 'Everywhere for its type'

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin-template-starters', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ starters?: TemplateStarter[] }>) : { starters: [] as TemplateStarter[] }))
      .then((d) => {
        if (!cancelled) setStarters(d.starters ?? [])
      })
      .catch(() => {
        if (!cancelled) setStarters([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const adminHref = useAdminHref()
  const create = async () => {
    setSaving(true)
    setError('')
    try {
      const body = starterId ? { starterId } : { kind }
      const res = await fetch('/api/admin-template-starters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: number | string; editorUrl?: string; error?: string }
      if (!res.ok || data.id === undefined) throw new Error(data.error || 'Could not create the template.')
      window.location.assign(data.editorUrl ?? adminHref(siteTemplateEditorPath(data.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the template.')
      setSaving(false)
    }
  }

  return (
    <section aria-label="New template" className={panel} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560 }}>
      <strong>New template</strong>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Type
        <select value={kind} onChange={(e) => { setKind(e.target.value as SiteTemplateKind); setStarterId('') }} style={{ maxWidth: 280 }}>
          {SITE_TEMPLATE_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
        Starter
        <select value={starterId} onChange={(e) => setStarterId(e.target.value)} style={{ maxWidth: 280 }}>
          <option value="">Blank</option>
          {forKind.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>{s.label}</option>
          ))}
        </select>
      </label>
      <p style={{ margin: 0, fontSize: 13 }}>Display rule: <strong>{rule}</strong>. You can narrow it in the visual builder.</p>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" className={templateButtonClass} disabled={saving} onClick={() => void create()}>
          {saving ? 'Creating...' : 'Create and open in visual builder'}
        </button>
        <button type="button" className={templateButtonClass} disabled={saving} onClick={onClose}>Cancel</button>
      </div>
      {error ? <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 13 }}>{error}</p> : null}
    </section>
  )
}

export default NewTemplate
