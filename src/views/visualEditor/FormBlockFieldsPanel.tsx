'use client'

/**
 * The form's fields, edited inside the page visual editor. Shown in the Settings tab when a Form block is
 * selected, so a person can change a form without leaving the page for another tab.
 *
 * It edits the form document itself (the form's working copy), because one form can sit on many pages. Every
 * control is a choice where one fits: element types, width, required, the spam options. Free text is only
 * used for labels, the submit text and the success message. Publishing stays in the form editor, so a half
 * edited form is never shown on the site.
 */

import React, { useEffect, useMemo, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { upgradeFieldsToLayout, type LayoutNode } from '@/features/forms/layout'
import {
  appendFormElement,
  formElementChoices,
  listEditableRows,
  moveNode,
  newNodeId,
  removeNode,
  updateNodeProps,
  type EditableRow,
} from '@/features/forms/layoutEdit'

type Inherited = 'inherit' | 'on' | 'off'
type Spam = { honeypot?: Inherited; minimumFillTime?: Inherited; turnstile?: Inherited }
type Settings = { submitButtonLabel?: string; successMessage?: string }

type Props = {
  formId: number | string
  /** Full form editor address (the admin path), for the advanced settings it still holds. */
  editorHref: string
}

const WIDTHS = ['full', 'half', 'third', 'twoThirds', 'quarter'] as const
const NO_VALUE = new Set(['ff-html', 'ff-step', 'ff-payment'])
const NO_WIDTH = new Set(['ff-step'])

const primaryKey = (elementType: string): 'title' | 'html' | 'label' => (elementType === 'ff-step' ? 'title' : elementType === 'ff-html' ? 'html' : 'label')

export const FormBlockFieldsPanel: React.FC<Props> = ({ formId, editorHref }) => {
  const t = useAdminT()
  const choices = useMemo(() => formElementChoices(), [])
  const [layout, setLayout] = useState<LayoutNode[] | null>(null)
  const [spam, setSpam] = useState<Spam>({})
  const [settings, setSettings] = useState<Settings>({})
  const [loadFailed, setLoadFailed] = useState(false)
  const [addType, setAddType] = useState<string>('ff-text')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    // The parent keys this panel by form id, so a different form mounts a fresh panel with empty state.
    let alive = true
    fetch(`/api/forms/${encodeURIComponent(String(formId))}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((doc: { layout?: unknown; fields?: unknown; spam?: Spam; settings?: Settings }) => {
        if (!alive) return
        const stored = Array.isArray(doc.layout) ? (doc.layout as LayoutNode[]) : []
        setLayout(stored.length > 0 ? stored : upgradeFieldsToLayout(doc.fields))
        setSpam(doc.spam ?? {})
        setSettings(doc.settings ?? {})
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [formId])

  const labels = useMemo(() => new Map(choices.map((c) => [c.elementType, c.label])), [choices])
  const rows: EditableRow[] = useMemo(() => (layout ? listEditableRows(layout) : []), [layout])

  const widthLabel: Record<(typeof WIDTHS)[number], string> = {
    full: t('ve.ffp.width.full'),
    half: t('ve.ffp.width.half'),
    third: t('ve.ffp.width.third'),
    twoThirds: t('ve.ffp.width.twoThirds'),
    quarter: t('ve.ffp.width.quarter'),
  }
  const inheritLabel: Record<Inherited, string> = { inherit: t('ve.ffp.inherit'), on: t('ve.ffp.on'), off: t('ve.ffp.off') }

  const changeLayout = (next: LayoutNode[]) => {
    setLayout(next)
    setStatus('idle')
  }

  const save = async () => {
    if (!layout) return
    setStatus('saving')
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(String(formId))}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout, spam, settings }),
      })
      setStatus(res.ok ? 'saved' : 'error')
    } catch {
      setStatus('error')
    }
  }

  if (loadFailed) {
    return (
      <section className="ve-ffp" aria-label={t('ve.ffp.title')}>
        <h4>{t('ve.ffp.title')}</h4>
        <p className="ve-error">{t('ve.ffp.loadError')}</p>
      </section>
    )
  }
  if (!layout) {
    return (
      <section className="ve-ffp" aria-label={t('ve.ffp.title')}>
        <h4>{t('ve.ffp.title')}</h4>
        <p className="ve-panel__hint">{t('ve.ffp.loading')}</p>
      </section>
    )
  }

  return (
    <section className="ve-ffp" aria-label={t('ve.ffp.title')}>
      <h4>{t('ve.ffp.title')}</h4>
      <p className="ve-panel__hint">{t('ve.ffp.hint')}</p>

      {rows.length === 0 && <p className="ve-panel__hint">{t('ve.ffp.empty')}</p>}
      <ol className="ve-ffp__rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {rows.map((row, index) => {
          const key = primaryKey(row.elementType)
          const value = typeof row.props[key] === 'string' ? (row.props[key] as string) : ''
          const name = labels.get(row.elementType) ?? row.elementType
          const hasWidth = !NO_WIDTH.has(row.elementType)
          return (
            <li key={row.id} className="ve-ffp__row" style={{ marginBottom: 12, paddingLeft: row.depth * 12 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
                <strong>{name}</strong>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="ve-btn ve-btn--ghost" aria-label={`${name}: ${t('ve.ffp.up')}`} disabled={index === 0} onClick={() => changeLayout(moveNode(layout, row.id, -1))}>
                    &uarr;
                  </button>
                  <button type="button" className="ve-btn ve-btn--ghost" aria-label={`${name}: ${t('ve.ffp.down')}`} disabled={index === rows.length - 1} onClick={() => changeLayout(moveNode(layout, row.id, 1))}>
                    &darr;
                  </button>
                  <button type="button" className="ve-btn ve-btn--ghost" aria-label={`${name}: ${t('ve.ffp.remove')}`} onClick={() => changeLayout(removeNode(layout, row.id))}>
                    {t('ve.ffp.remove')}
                  </button>
                </span>
              </div>
              {key === 'html' ? (
                <label className="ve-field ve-field--full">
                  <span>{t('ve.ffp.html')}</span>
                  <textarea rows={3} value={value} onChange={(e) => changeLayout(updateNodeProps(layout, row.id, { html: e.target.value }))} />
                </label>
              ) : (
                <label className="ve-field ve-field--full">
                  <span>{key === 'title' ? t('ve.ffp.stepTitle') : t('ve.ffp.label')}</span>
                  <input type="text" value={value} onChange={(e) => changeLayout(updateNodeProps(layout, row.id, { [key]: e.target.value }))} />
                </label>
              )}
              {!NO_VALUE.has(row.elementType) && (
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginRight: 12 }}>
                  <input type="checkbox" checked={row.props.required === true} onChange={(e) => changeLayout(updateNodeProps(layout, row.id, { required: e.target.checked }))} />
                  <span>{t('ve.ffp.required')}</span>
                </label>
              )}
              {hasWidth && (
                <label className="ve-field" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <span>{t('ve.ffp.width')}</span>
                  <select
                    value={WIDTHS.includes(row.props.width as never) ? String(row.props.width) : 'full'}
                    onChange={(e) => changeLayout(updateNodeProps(layout, row.id, { width: e.target.value }))}
                  >
                    {WIDTHS.map((w) => (
                      <option key={w} value={w}>
                        {widthLabel[w]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          )
        })}
      </ol>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <label className="ve-field">
          <span>{t('ve.ffp.addLabel')}</span>
          <select value={addType} onChange={(e) => setAddType(e.target.value)}>
            {choices.map((c) => (
              <option key={c.elementType} value={c.elementType}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ve-btn" onClick={() => changeLayout(appendFormElement(layout, addType, newNodeId()))}>
          {t('ve.ffp.add')}
        </button>
      </div>

      <h5>{t('ve.ffp.submit')}</h5>
      <label className="ve-field ve-field--full">
        <span>{t('ve.ffp.submitLabel')}</span>
        <input type="text" value={settings.submitButtonLabel ?? ''} onChange={(e) => { setSettings({ ...settings, submitButtonLabel: e.target.value }); setStatus('idle') }} />
      </label>
      <label className="ve-field ve-field--full">
        <span>{t('ve.ffp.successMessage')}</span>
        <textarea rows={2} value={settings.successMessage ?? ''} onChange={(e) => { setSettings({ ...settings, successMessage: e.target.value }); setStatus('idle') }} />
      </label>

      <h5>{t('ve.ffp.antiSpam')}</h5>
      {(
        [
          ['honeypot', t('ve.ffp.honeypot')],
          ['minimumFillTime', t('ve.ffp.minFill')],
          ['turnstile', t('ve.ffp.turnstile')],
        ] as const
      ).map(([key, title]) => (
        <label key={key} className="ve-field ve-field--full">
          <span>{title}</span>
          <select value={spam[key] ?? 'inherit'} onChange={(e) => { setSpam({ ...spam, [key]: e.target.value as Inherited }); setStatus('idle') }}>
            {(['inherit', 'on', 'off'] as const).map((option) => (
              <option key={option} value={option}>
                {inheritLabel[option]}
              </option>
            ))}
          </select>
        </label>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" className="ve-btn ve-btn--primary" disabled={status === 'saving'} onClick={save}>
          {status === 'saving' ? t('ve.ffp.saving') : t('ve.ffp.save')}
        </button>
        <span role="status" aria-live="polite" className="ve-panel__hint">
          {status === 'saved' ? t('ve.ffp.saved') : status === 'error' ? t('ve.ffp.saveError') : ''}
        </span>
      </div>
      <p className="ve-panel__hint">
        <a href={editorHref}>{t('ve.ffp.openEditor')}</a>
      </p>
    </section>
  )
}
