'use client'

import React, { useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'

import { TEMPLATES_CHANGED_EVENT } from './TemplateBrowser'
import { TEMPLATE_CATEGORY_OPTIONS, type TemplateKind } from './templatePresets'
import { stripEditorIds } from './treeOps'

/**
 * The "Save as template" dialog: stores the whole page, or the selected top-level section, as a Page Template
 * (kind + category) so it shows up under "My templates" in the Templates tab. Editor ids and section locks are
 * not copied: the saved copy gets fresh ids whenever it is inserted.
 */
export const SaveAsTemplateDialog: React.FC<{
  pageBlocks: SectionNode[]
  /** The selected top-level section, when there is one. */
  selectedSection?: SectionNode
  defaultName?: string
  onClose: () => void
  onSaved: () => void
}> = ({ pageBlocks, selectedSection, defaultName, onClose, onSaved }) => {
  const [scope, setScope] = useState<'section' | 'page'>(selectedSection ? 'section' : 'page')
  const [kind, setKind] = useState<TemplateKind>(selectedSection ? 'section' : 'page')
  const [name, setName] = useState(defaultName || '')
  const [category, setCategory] = useState<string>('other')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chooseScope = (next: 'section' | 'page') => {
    setScope(next)
    setKind(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the template a name.')
      return
    }
    const source = scope === 'section' && selectedSection ? [selectedSection] : pageBlocks
    if (source.length === 0) {
      setError('There is nothing on the page to save yet.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/page-templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, kind, category, blocks: stripEditorIds(source) }),
      })
      if (res.status === 401 || res.status === 403) throw new Error('You do not have permission to save templates.')
      if (!res.ok) {
        const json = (await res.json().catch((): null => null)) as { errors?: Array<{ message?: string }> } | null
        throw new Error(json?.errors?.[0]?.message || `The template could not be saved (${res.status}).`)
      }
      window.dispatchEvent(new CustomEvent(TEMPLATES_CHANGED_EVENT))
      onSaved()
    } catch (err) {
      setError((err as Error)?.message || 'The template could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div className="ve-modal-overlay" role="presentation" onClick={onClose}>
      <div className="ve-modal ve-tpl-dialog" role="dialog" aria-modal="true" aria-labelledby="ve-tpl-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="ve-modal__header">
          <strong id="ve-tpl-dialog-title">Save as template</strong>
          <button type="button" className="ve-btn ve-btn--ghost ve-btn--icon" aria-label="Close" onClick={onClose}>
            x
          </button>
        </div>
        <form className="ve-modal__body ve-tpl-dialog__form" onSubmit={submit}>
          {selectedSection && (
            <label>
              What to save
              <select value={scope} onChange={(e) => chooseScope(e.target.value as 'section' | 'page')}>
                <option value="section">The selected section</option>
                <option value="page">The whole page</option>
              </select>
            </label>
          )}
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
          </label>
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)}>
              <option value="section">Section (dropped into a page)</option>
              <option value="page">Page (a whole layout)</option>
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {TEMPLATE_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="ve-error" role="alert">
              {error}
            </p>
          )}
          <div className="ve-tpl-dialog__actions">
            <button type="button" className="ve-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="ve-btn ve-btn--primary" disabled={busy}>
              {busy ? 'Saving' : 'Save template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
