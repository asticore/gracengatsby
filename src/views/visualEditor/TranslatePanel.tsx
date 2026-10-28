import React, { useEffect, useRef, useState } from 'react'

import { errorMessageFrom, TranslationStatusBadge } from '@/features/multilingual/views/TranslationStatusBadge'
import type { DocumentTranslationField, DocumentTranslations } from '@/features/multilingual/documentTranslations'
import { STATUS_LABELS } from '@/features/multilingual/translationStatus'

/**
 * Translate mode in the builder's dock. Replaces the element library and the
 * settings tabs while a non-default language is being edited: the canvas is
 * then read-only (layout is edited in the default language), and this panel
 * is where the page's translatable text is written.
 *
 * Saves go to the translations collection REST API, so the workflow hook
 * decides the resulting status and refuses an approval the viewer may not
 * give. The button shown is a convenience; the server is the check.
 */

type Props = {
  state: DocumentTranslations
  locale: string
  localeLabel: string
  title: string
  users: { id: number; label: string }[]
  onSaved: () => void
  onExit: () => void
  /** The field path the canvas focused (a click on the page), or null. */
  focusFieldPath?: string | null
  /** Each keystroke in a translation, so the canvas can show it live. */
  onDraftChange?: (fieldPath: string, value: string) => void
}

const API = '/api/translations'

async function send(method: 'POST' | 'PATCH', url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data: unknown = await response.json().catch((): null => null)
    throw new Error(errorMessageFrom(data, `Could not save (${response.status}).`))
  }
}

function FieldEditor({
  field,
  locale,
  sourceId,
  users,
  onSaved,
  focused,
  onDraftChange,
}: {
  field: DocumentTranslationField
  locale: string
  sourceId: string
  users: Props['users']
  onSaved: () => void
  /** Set when the canvas focused this row: it is scrolled into view and highlighted. */
  focused: boolean
  onDraftChange?: (fieldPath: string, value: string) => void
}): React.ReactElement {
  const sectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (focused) sectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])
  const [draft, setDraft] = useState(field.value)
  const [busy, setBusy] = useState<'idle' | 'saving' | 'approving'>('idle')
  const [error, setError] = useState<string | null>(null)

  // A fresh server state replaces the draft only when the stored value changed underneath it.
  const [seen, setSeen] = useState(field.value)
  if (seen !== field.value) {
    setSeen(field.value)
    setDraft(field.value)
  }

  const run = async (kind: 'save' | 'approve') => {
    setBusy(kind === 'save' ? 'saving' : 'approving')
    setError(null)
    try {
      if (field.rowId !== null) {
        const body: Record<string, unknown> = kind === 'approve' ? { status: 'approved', sourceText: field.sourceText } : { value: draft, sourceText: field.sourceText }
        await send('PATCH', `${API}/${field.rowId}`, body)
      } else {
        await send('POST', API, {
          locale,
          sourceKind: 'collection',
          sourceId,
          fieldPath: field.fieldPath,
          value: draft,
          sourceText: field.sourceText,
        })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy('idle')
    }
  }

  // Typing is mirrored up to the canvas, so the page reads in the new text before it is saved.
  const changeDraft = (value: string) => {
    setDraft(value)
    onDraftChange?.(field.fieldPath, value)
  }

  const assigned = field.assignees.map((id) => users.find((user) => user.id === id)?.label ?? `User ${id}`)
  const dirty = draft !== field.value

  return (
    <section ref={sectionRef} className={`ve-translate__field${focused ? ' ve-translate__field--focus' : ''}`} data-field={field.fieldPath}>
      <header className="ve-translate__field-head">
        <strong>{field.label}</strong>
        <TranslationStatusBadge status={field.status} label={STATUS_LABELS[field.status]} />
      </header>

      <div className="ve-translate__source">
        <span className="ve-translate__hint">Source (default language)</span>
        <p className="ve-translate__source-text">{field.sourceText}</p>
      </div>

      {field.richText ? (
        <p className="ve-translate__note">
          Rich text is kept in the default language and is shown here for reference only. Translating it is not supported yet.
        </p>
      ) : (
        <>
          <label className="ve-translate__label">
            <span className="ve-translate__hint">Translation</span>
            {field.size === 'long' ? (
              <textarea rows={3} value={draft} onChange={(event) => changeDraft(event.target.value)} disabled={busy !== 'idle'} />
            ) : (
              <input type="text" value={draft} onChange={(event) => changeDraft(event.target.value)} disabled={busy !== 'idle'} />
            )}
          </label>

          <p className="ve-translate__assignees">
            {assigned.length > 0 ? `Assigned to ${assigned.join(', ')}` : 'Not assigned'}
          </p>

          <div className="ve-translate__actions">
            <button type="button" className="ve-btn" onClick={() => run('save')} disabled={!dirty || busy !== 'idle'}>
              {busy === 'saving' ? 'Saving' : 'Save'}
            </button>
            {field.canApprove && field.value.trim().length > 0 && field.status !== 'approved' ? (
              <button type="button" className="ve-btn ve-btn--primary" onClick={() => run('approve')} disabled={dirty || busy !== 'idle'}>
                {busy === 'approving' ? 'Approving' : 'Approve'}
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="ve-translate__error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

/**
 * The fields in the order the page lists them, with a block's fields kept
 * together under one heading. Page-level fields (title, SEO) come first.
 */
function fieldSections(fields: DocumentTranslationField[]): Array<{ key: string; block: DocumentTranslationField['group']; fields: DocumentTranslationField[] }> {
  const sections: Array<{ key: string; block: DocumentTranslationField['group']; fields: DocumentTranslationField[] }> = []
  const byBlock = new Map<string, (typeof sections)[number]>()
  for (const field of fields) {
    if (!field.group) {
      sections.push({ key: `field:${field.fieldPath}`, block: null, fields: [field] })
      continue
    }
    let section = byBlock.get(field.group.key)
    if (!section) {
      section = { key: `block:${field.group.key}`, block: field.group, fields: [] }
      byBlock.set(field.group.key, section)
      sections.push(section)
    }
    section.fields.push(field)
  }
  return sections
}

export function TranslatePanel({ state, locale, localeLabel, title, users, onSaved, onExit, focusFieldPath = null, onDraftChange }: Props): React.ReactElement {
  const group = state.locales.find((entry) => entry.locale === locale)
  return (
    <div className="ve-translate" data-locale={locale}>
      <div className="ve-translate__top">
        <div>
          <strong>Translating into {localeLabel}</strong>
          <p className="ve-translate__hint">{title}</p>
        </div>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={onExit}>
          Back to layout
        </button>
      </div>
      <p className="ve-translate__note">
        {group ? `${group.approved}/${group.total} approved` : 'No translatable text on this page.'} Layout and blocks are
        edited in the default language; the canvas is read-only while translating.
      </p>
      {fieldSections(group?.fields ?? []).map((section) =>
        section.block ? (
          <div className="ve-translate__block" key={section.key} data-block={section.block.key}>
            <header className="ve-translate__block-head">
              <strong>{section.block.blockLabel}</strong>
              {section.block.preview ? <span className="ve-translate__hint">{section.block.preview}</span> : null}
            </header>
            {section.fields.map((field) => (
              <FieldEditor key={field.fieldPath} field={field} locale={locale} sourceId={state.sourceId} users={users} onSaved={onSaved} focused={field.fieldPath === focusFieldPath} onDraftChange={onDraftChange} />
            ))}
          </div>
        ) : (
          section.fields.map((field) => (
            <FieldEditor key={field.fieldPath} field={field} locale={locale} sourceId={state.sourceId} users={users} onSaved={onSaved} focused={field.fieldPath === focusFieldPath} onDraftChange={onDraftChange} />
          ))
        ),
      )}
    </div>
  )
}

export const TRANSLATE_PANEL_CSS = `
.ve-translate { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.ve-translate__top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.ve-translate__field { border: 1px solid var(--theme-elevation-200, #e4e4e7); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.ve-translate__field-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ve-translate__hint { font-size: 12px; color: var(--theme-elevation-600, #52525b); }
.ve-translate__source-text { margin: 2px 0 0; white-space: pre-wrap; font-size: 13px; }
.ve-translate__label { display: flex; flex-direction: column; gap: 4px; }
.ve-translate__label textarea, .ve-translate__label input { font: inherit; font-size: 13px; padding: 6px; border-radius: 6px; border: 1px solid var(--theme-elevation-200, #d4d4d8); width: 100%; box-sizing: border-box; }
.ve-translate__actions { display: flex; gap: 8px; }
.ve-translate__assignees, .ve-translate__note { font-size: 12px; margin: 0; color: var(--theme-elevation-600, #52525b); }
.ve-translate__error { font-size: 12px; margin: 0; color: var(--theme-error-500, #dc2626); }
.ve-translate__block { display: flex; flex-direction: column; gap: 8px; border-left: 3px solid var(--theme-elevation-200, #d4d4d8); padding-left: 10px; }
.ve-translate__block-head { display: flex; flex-direction: column; gap: 2px; }
.ve-translate__field--focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25); }
`
