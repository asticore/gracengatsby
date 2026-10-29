'use client'

import React, { useMemo, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { errorMessageFrom, TranslationStatusBadge } from './TranslationStatusBadge'
import type { TranslationStatus } from '../translationStatus'
import type { OverviewUser } from './TranslationsOverview'

/**
 * The editor for one item: every field, in every language, side by side.
 *
 * Opened from a row, beside the table, so the list does not have to be left to
 * translate something. Saves write the changed cells through /api/translations,
 * the collection's own endpoint, so the workflow rule applies here exactly as it
 * does anywhere else; an approval a person may not give is shown as refused,
 * with the reason, rather than saved unapproved.
 */

export type EditorField = { fieldPath: string; label: string; sourceText: string }

export type EditorCell = {
  fieldPath: string
  locale: string
  value: string
  id: string | number | null
  status: TranslationStatus
  statusLabel: string
  assignees: number[]
}

export type TranslationEditorProps = {
  itemKey: string
  title: string
  typeLabel: string
  editHref: string | null
  sourceKind: string
  sourceId: string
  sourceLocale: string
  sourceLabel: string
  targetLocales: string[]
  localeLabels: Record<string, string>
  fields: EditorField[]
  cells: EditorCell[]
  users: OverviewUser[]
  approvable: Record<string, boolean>
  apiBase: string
  bulkApi: string
  requireReview: boolean
  closeHref: string
}

const cellKey = (fieldPath: string, locale: string) => `${fieldPath}::${locale}`

export function TranslationEditor(props: TranslationEditorProps) {
  const t = useAdminT()
  const initial = useMemo(() => new Map(props.cells.map((cell) => [cellKey(cell.fieldPath, cell.locale), cell])), [props.cells])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [assignees, setAssignees] = useState<number[]>(() => {
    const first = props.cells.find((cell) => cell.assignees.length > 0)
    return first ? first.assignees : []
  })

  const valueOf = (fieldPath: string, locale: string) => drafts[cellKey(fieldPath, locale)] ?? initial.get(cellKey(fieldPath, locale))?.value ?? ''
  const changed = Object.keys(drafts).filter((key) => {
    const [fieldPath, locale] = key.split('::')
    return (initial.get(cellKey(fieldPath, locale))?.value ?? '') !== drafts[key]
  })

  const translateWithMachine = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch(props.bulkApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'translate', items: [props.itemKey], overwrite: false }),
      })
      const body = (await response.json().catch((): null => null)) as { updated?: number; refused?: string[]; error?: string } | null
      if (!response.ok) {
        setMessage({ tone: 'error', text: body?.error ?? t('translations.editor.machineFailed') })
        return
      }
      const refused = body?.refused ?? []
      setMessage({
        tone: refused.length ? 'error' : 'ok',
        text: [`${body?.updated ?? 0} machine drafts written.`, ...refused].join(' '),
      })
      if ((body?.updated ?? 0) > 0) setTimeout(() => window.location.reload(), 600)
    } catch {
      setMessage({ tone: 'error', text: t('translations.errReach') })
    } finally {
      setBusy(false)
    }
  }

  const request = async (url: string, method: string, body: unknown): Promise<{ ok: boolean; json: unknown }> => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const json: unknown = await response.json().catch((): null => null)
    return { ok: response.ok, json }
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    const problems: string[] = []
    let saved = 0
    try {
      for (const key of changed) {
        const [fieldPath, locale] = key.split('::')
        const field = props.fields.find((entry) => entry.fieldPath === fieldPath)
        const existing = initial.get(cellKey(fieldPath, locale))
        const value = drafts[key]
        const payload = { value, sourceText: field?.sourceText ?? '' }
        const result = existing?.id
          ? await request(`${props.apiBase}/${existing.id}`, 'PATCH', payload)
          : await request(props.apiBase, 'POST', { ...payload, locale, sourceKind: props.sourceKind, sourceId: props.sourceId, fieldPath })
        if (result.ok) saved += 1
        else problems.push(`${props.localeLabels[locale] ?? locale}, ${field?.label ?? fieldPath}: ${errorMessageFrom(result.json, t('translations.editor.notSaved'))}`)
      }
      if (saved > 0 && problems.length === 0) {
        setDrafts({})
        setMessage({ tone: 'ok', text: saved === 1 ? t('translations.editor.savedOne', { count: saved }) : t('translations.editor.savedOther', { count: saved }) })
        setTimeout(() => window.location.reload(), 500)
      } else {
        setMessage({ tone: 'error', text: [...(saved ? [t('translations.editor.savedPartial', { count: saved })] : []), ...problems].join(' ') })
      }
    } catch {
      setMessage({ tone: 'error', text: t('translations.errReach') })
    } finally {
      setBusy(false)
    }
  }

  const approve = async (locale: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await request(props.bulkApi, 'POST', { action: 'approve', items: [props.itemKey], locales: [locale] })
      const body = result.json as { updated?: number; refused?: string[] } | null
      if (!result.ok) setMessage({ tone: 'error', text: errorMessageFrom(result.json, t('translations.editor.couldNotApprove')) })
      else if ((body?.refused ?? []).length) setMessage({ tone: 'error', text: body?.refused?.join(' ') ?? '' })
      else {
        setMessage({ tone: 'ok', text: t('translations.editor.approvedIn', { count: body?.updated ?? 0, locale: props.localeLabels[locale] ?? locale }) })
        setTimeout(() => window.location.reload(), 500)
      }
    } catch {
      setMessage({ tone: 'error', text: t('translations.errReach') })
    } finally {
      setBusy(false)
    }
  }

  const assign = async () => {
    setBusy(true)
    setMessage(null)
    const result = await request(props.bulkApi, 'POST', { action: 'assign', items: [props.itemKey], assignees })
    setBusy(false)
    if (!result.ok) setMessage({ tone: 'error', text: errorMessageFrom(result.json, t('translations.editor.couldNotAssign')) })
    else {
      setMessage({ tone: 'ok', text: assignees.length ? t('translations.editor.assignedEmailed') : t('translations.editor.assignmentCleared') })
      setTimeout(() => window.location.reload(), 500)
    }
  }

  const inputClass =
    'w-full min-w-[160px] rounded-[5px] border border-[var(--theme-elevation-150)] bg-[var(--theme-input-bg,#fff)] p-[6px] text-[13px] text-inherit [font:inherit]'

  return (
    <aside className="flex flex-col gap-[12px] rounded-[8px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] p-[16px]" aria-label={t('translations.editor.title')}>
      <header className="flex items-start justify-between gap-[8px]">
        <div>
          <p className="text-[12px] opacity-70">{props.typeLabel}</p>
          <h2 className="text-[18px] font-semibold">{props.title}</h2>
          {props.editHref ? (
            <a className="list-link text-[13px]" href={props.editHref}>
              Open the document
            </a>
          ) : null}
        </div>
        <a className="text-[13px] underline" href={props.closeHref}>
          {t('common.close')}
        </a>
      </header>

      <div className="flex flex-wrap items-center gap-[8px] text-[13px]">
        <button type="button" className="btn" disabled={busy} onClick={translateWithMachine}>
          {t('translations.translateMachine')}
        </button>
        <span className="opacity-70">{t('translations.editor.machineHint')}</span>
      </div>

      {message ? (
        <p role="status" className={`text-[13px] ${message.tone === 'error' ? 'text-[var(--theme-error-500,#dc2626)]' : ''}`}>
          {message.text}
        </p>
      ) : null}

      {props.fields.map((field) => (
        <section key={field.fieldPath} className="flex flex-col gap-[8px] border-t border-[var(--theme-elevation-100)] pt-[10px]">
          <h3 className="text-[14px] font-semibold">{field.label}</h3>
          {field.fieldPath === 'slug' ? <p className="text-[12px] opacity-70">{t('translations.slug.hint')}</p> : null}
          <div className="text-[13px] whitespace-pre-wrap rounded-[5px] bg-[var(--theme-elevation-100)] p-[8px]">
            <span className="block text-[11px] opacity-70">{props.sourceLabel} (source)</span>
            {field.sourceText}
          </div>
          {props.targetLocales.map((locale) => {
            const stored = initial.get(cellKey(field.fieldPath, locale))
            return (
              <label key={locale} className="flex flex-col gap-[4px]">
                <span className="flex items-center justify-between gap-[8px] text-[12px]">
                  <span>{props.localeLabels[locale] ?? locale}</span>
                  {stored ? <TranslationStatusBadge status={stored.status} label={stored.statusLabel} /> : null}
                </span>
                <textarea
                  className={inputClass}
                  rows={field.sourceText.length > 60 ? 4 : 2}
                  value={valueOf(field.fieldPath, locale)}
                  onChange={(event) => setDrafts((current) => ({ ...current, [cellKey(field.fieldPath, locale)]: event.target.value }))}
                  aria-label={t('translations.editor.fieldLabel', { field: field.label, locale: props.localeLabels[locale] ?? locale })}
                />
              </label>
            )
          })}
        </section>
      ))}

      <div className="flex flex-wrap gap-[8px]">
        <button type="button" className="btn" disabled={busy || changed.length === 0} onClick={save}>
          {t('common.save')}{changed.length ? ' ' + (changed.length === 1 ? t('translations.editor.saveChangesOne', { count: changed.length }) : t('translations.editor.saveChangesOther', { count: changed.length })) : ''}
        </button>
        {props.targetLocales.map((locale) => (
          <button
            key={locale}
            type="button"
            className="btn"
            disabled={busy || !props.approvable[locale]}
            title={props.approvable[locale] ? undefined : t('translations.editor.onlyReviewer')}
            onClick={() => approve(locale)}
          >
            {t('translations.editor.approve', { locale: props.localeLabels[locale] ?? locale })}
          </button>
        ))}
      </div>

      <details className="text-[13px]">
        <summary className="cursor-pointer">{t('translations.editor.assignThis')}</summary>
        <div className="mt-[6px] flex flex-col gap-[4px] rounded-[5px] border border-[var(--theme-elevation-150)] p-[8px]">
          {props.users.map((user) => (
            <label key={user.id} className="flex items-center gap-[6px]">
              <input
                type="checkbox"
                checked={assignees.includes(user.id)}
                onChange={(event) =>
                  setAssignees((current) => (event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id)))
                }
              />
              {user.label}
            </label>
          ))}
          <button type="button" className="btn" disabled={busy} onClick={assign}>
            {t('translations.editor.saveAssignment')}
          </button>
        </div>
      </details>
      {props.requireReview ? (
        <p className="text-[12px] opacity-70">{t('translations.editor.reviewOn')}</p>
      ) : null}
    </aside>
  )
}

export default TranslationEditor
