'use client'

import React, { useEffect, useMemo, useState } from 'react'

import { computeTemplateCoverage, type CoverageWarning } from '../coverage'
import { summariseConditions } from '../conditionsSummary'
import { KIND_LABELS, PUBLIC_PREVIEW_PATH, SITE_TEMPLATE_KINDS, TEMPLATE_TYPE_TABS, type SiteTemplateKind } from '../kinds'

type Row = {
  id: number | string
  name?: string | null
  kind: SiteTemplateKind
  enabled?: boolean | null
  priority?: number | null
  conditions?: unknown
  blocks?: unknown[] | null
}

type Starter = { id: string; kind: SiteTemplateKind; label: string; description: string }

const button =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit no-underline hover:border-[#2e3192] disabled:cursor-not-allowed disabled:opacity-50'
const panel = 'rounded-[6px] border border-[var(--theme-elevation-150,#cac7d1)] p-[12px]'

const editorHref = (id: number | string) => `/admin/visual-editor/collection/site-templates/${id}`

/** What a kind shows when no template is in use: the empty-state line on its row. */
const fallbackLine = (kind: SiteTemplateKind) => `No ${KIND_LABELS[kind].toLowerCase()} template is in use, so the site shows its default.`

/**
 * The Templates dashboard, shown above the site-templates list. Tabs per template type, one row per template
 * (and one empty row per kind with none), a coverage panel of warnings, and "New template".
 * Reads and writes through the normal REST API, so the collection's access rules apply.
 */
export const TemplatesDashboard: React.FC = () => {
  const [templates, setTemplates] = useState<Row[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [starters, setStarters] = useState<Starter[]>([])
  const [tab, setTab] = useState(TEMPLATE_TYPE_TABS[0].id)
  const [creating, setCreating] = useState<{ kind: SiteTemplateKind } | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/site-templates?limit=500&depth=0', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'You do not have access to site templates.' : 'Could not load templates.')
        return res.json() as Promise<{ docs?: Row[] }>
      })
      .then((data) => {
        if (!cancelled) setTemplates(Array.isArray(data.docs) ? data.docs : [])
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load templates.')
      })
    fetch('/api/admin-template-starters', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<{ starters?: Starter[] }>) : { starters: [] as Starter[] }))
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

  const warnings = useMemo<CoverageWarning[]>(() => (templates ? computeTemplateCoverage(templates) : []), [templates])

  const rowsOf = (kind: SiteTemplateKind): Row[] =>
    (templates ?? [])
      .filter((t) => t.kind === kind)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || Number(a.id) - Number(b.id))

  const toggle = async (row: Row) => {
    const next = row.enabled === false
    const key = String(row.id)
    setBusy(key)
    setNotice('')
    setTemplates((list) => (list ?? []).map((t) => (t.id === row.id ? { ...t, enabled: next } : t)))
    try {
      const res = await fetch(`/api/site-templates/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error('Could not switch it. Try again.')
    } catch (e) {
      setTemplates((list) => (list ?? []).map((t) => (t.id === row.id ? { ...t, enabled: row.enabled } : t)))
      setNotice(e instanceof Error ? e.message : 'Could not switch it.')
    } finally {
      setBusy(null)
    }
  }

  const tabOf = (kind: SiteTemplateKind) => TEMPLATE_TYPE_TABS.find((t) => t.kinds.includes(kind))?.id ?? TEMPLATE_TYPE_TABS[0].id
  const activeTab = TEMPLATE_TYPE_TABS.find((t) => t.id === tab) ?? TEMPLATE_TYPE_TABS[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }} data-testid="templates-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>Templates</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={button} onClick={() => setCreating({ kind: activeTab.kinds[0] })}>
            New template
          </button>
        </div>
      </div>

      {loadError ? <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{loadError}</p> : null}

      <section aria-label="Coverage" className={panel} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <strong>Coverage</strong>
        {templates === null && !loadError ? <p style={{ margin: 0, fontSize: 13 }}>Checking...</p> : null}
        {templates !== null && warnings.length === 0 ? <p style={{ margin: 0, fontSize: 13 }}>Every template type has a template in use, and none overlap.</p> : null}
        {warnings.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {warnings.map((w, i) => (
              <li key={`${w.code}-${w.kind}-${i}`}>
                {w.message}{' '}
                <button type="button" onClick={() => setTab(tabOf(w.kind))} style={{ background: 'none', border: 0, padding: 0, color: '#2e3192', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>
                  Show
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {creating ? (
        <NewTemplate
          key={creating.kind}
          starters={starters}
          initialKind={creating.kind}
          onClose={() => setCreating(null)}
        />
      ) : null}

      <div role="tablist" aria-label="Template types" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--theme-elevation-150,#cac7d1)' }}>
        {TEMPLATE_TYPE_TABS.map((t) => {
          const count = (templates ?? []).filter((r) => t.kinds.includes(r.kind)).length
          const selected = t.id === activeTab.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 0,
                borderBottom: selected ? '2px solid #2e3192' : '2px solid transparent',
                padding: '6px 10px',
                cursor: 'pointer',
                fontWeight: selected ? 600 : 400,
                color: 'inherit',
                font: 'inherit',
              }}
            >
              {t.label} ({count})
            </button>
          )
        })}
      </div>

      {notice ? <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 13 }}>{notice}</p> : null}

      <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {activeTab.kinds.map((kind) => {
          const rows = rowsOf(kind)
          const preview = PUBLIC_PREVIEW_PATH[kind]
          return (
            <section key={kind} aria-label={KIND_LABELS[kind]} className={panel} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <strong>{KIND_LABELS[kind]}</strong>
              {rows.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ opacity: 0.8 }}>{templates === null ? 'Loading...' : fallbackLine(kind)}</span>
                  {templates !== null ? (
                    <button type="button" className={button} onClick={() => setCreating({ kind })}>
                      New {KIND_LABELS[kind].toLowerCase()} template
                    </button>
                  ) : null}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left' }}>
                      <th scope="col">Name</th>
                      <th scope="col">On</th>
                      <th scope="col">Where it applies</th>
                      <th scope="col">Priority</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const on = row.enabled !== false
                      return (
                        <tr key={String(row.id)} style={{ borderTop: '1px solid var(--theme-elevation-100,#e5e3ea)' }}>
                          <td style={{ padding: '6px 8px 6px 0' }}>{row.name || `Untitled ${row.id}`}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              aria-label={`${on ? 'On' : 'Off'}: ${row.name || row.id}. Switch ${on ? 'off' : 'on'}`}
                              disabled={busy === String(row.id)}
                              onClick={() => void toggle(row)}
                              style={{ cursor: 'pointer', border: 0, background: on ? '#2e3192' : '#9a98a3', borderRadius: 999, width: 36, height: 20, position: 'relative', color: 'transparent' }}
                            >
                              <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff' }} />
                            </button>
                          </td>
                          <td style={{ padding: '6px 8px', maxWidth: 360 }}>{summariseConditions(row.conditions)}</td>
                          <td style={{ padding: '6px 8px' }}>{row.priority ?? 0}</td>
                          <td style={{ padding: '6px 0 6px 8px', whiteSpace: 'nowrap' }}>
                            <a className={button} href={editorHref(row.id)}>Edit with visual builder</a>{' '}
                            {preview ? (
                              <a className={button} href={preview} target="_blank" rel="noopener noreferrer">Preview</a>
                            ) : (
                              <a className={button} href={editorHref(row.id)} title="Shows a sample item in the visual builder (Preview as)">Preview</a>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** Type, starter and display rule, then create the draft and open it in the visual builder. */
const NewTemplate: React.FC<{ starters: Starter[]; initialKind: SiteTemplateKind; onClose: () => void }> = ({ starters, initialKind, onClose }) => {
  const [kind, setKind] = useState<SiteTemplateKind>(initialKind)
  const forKind = starters.filter((s) => s.kind === kind)
  const [starterId, setStarterId] = useState<string>('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  // Header and footer default to the whole site. Other kinds default to everywhere for their type.
  const rule = kind === 'header' || kind === 'footer' ? 'Entire site' : 'Everywhere for its type'

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
      window.location.assign(data.editorUrl ?? editorHref(data.id))
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
        <button type="button" className={button} disabled={saving} onClick={() => void create()}>
          {saving ? 'Creating...' : 'Create and open in visual builder'}
        </button>
        <button type="button" className={button} disabled={saving} onClick={onClose}>Cancel</button>
      </div>
      {error ? <p role="alert" style={{ color: '#b91c1c', margin: 0, fontSize: 13 }}>{error}</p> : null}
    </section>
  )
}

export default TemplatesDashboard
