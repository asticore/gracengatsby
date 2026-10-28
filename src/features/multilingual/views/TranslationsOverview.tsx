'use client'

import React, { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { formatDateCell } from '@/admin/list/dateFormatter'
import type { UiStringKey } from '@/features/uiStrings'

import { TranslationStatusBadge, errorMessageFrom } from './TranslationStatusBadge'
import type { TranslationStatus } from '../translationStatus'

/**
 * The overview table, with the bulk bar.
 *
 * Rows are selected with the checkboxes; the bar above the table then approves
 * the selected items in every language, or assigns them to people. Both go to
 * the bulk route, which applies the same approval rule as a single save and
 * reports, per reason, what it had to leave alone.
 */

export type OverviewListRow = {
  key: string
  title: string
  typeLabel: string
  progress: number
  updatedAt: string | null
  /** Public address of the page, or null. */
  url: string | null
  /** Where the title goes: the builder's Translate mode, or the document editor fallback. */
  editHref: string
  mode: 'builder' | 'editor'
  inactiveCount: number
  outdatedCount: number
  inactive: Array<{ locale: string; localeLabel: string; fieldPath: string; reason: 'field-removed' | 'document-missing'; value: string }>
  cells: Array<{
    locale: string
    status: TranslationStatus
    statusLabel: string
    approved: number
    total: number
    href: string
    mode: 'builder' | 'editor'
  }>
  assignees: Array<{ id: number; label: string }>
}

export type OverviewUser = { id: number; label: string; email: string }

export type TranslationsOverviewProps = {
  rows: OverviewListRow[]
  visibleNames: string[]
  targetLocales: string[]
  localeLabels: Record<string, string>
  users: OverviewUser[]
  sortState: string
  sortLinks: Record<string, string>
  bulkApi: string
  /** The same route as bulkApi; clear-inactive is a second action on it. */
  clearApi?: string
  hasRows: boolean
  emptyFiltered: boolean
  selectedKey: string | null
  page: number
  totalPages: number
  totalMatching: number
  prevHref: string | null
  nextHref: string | null
}

const SORTABLE = new Set(['title', 'type', 'progress', 'updatedAt'])
const COLUMN_KEYS: Record<string, UiStringKey> = {
  title: 'translations.colTitle',
  type: 'translations.colType',
  url: 'translations.colUrl',
  progress: 'translations.colProgress',
  inactive: 'translations.colInactive',
  assignee: 'translations.colAssignee',
  updatedAt: 'translations.colUpdatedAt',
}

const REASON_KEYS: Record<'field-removed' | 'document-missing', UiStringKey> = {
  'field-removed': 'translations.reasonFieldRemoved',
  'document-missing': 'translations.reasonDocumentMissing',
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

export function TranslationsOverview(props: TranslationsOverviewProps) {
  const t = useAdminT()
  const columnLabel = (name: string): string => (COLUMN_KEYS[name] ? t(COLUMN_KEYS[name]) : name)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [assignees, setAssignees] = useState<number[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)

  const langColumns = props.visibleNames.filter((name) => name.startsWith('lang:')).map((name) => name.slice(5))
  const allSelected = props.rows.length > 0 && props.rows.every((row) => picked.has(row.key))

  const toggle = (key: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const send = async (payload: Record<string, unknown>, done: string): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch(props.bulkApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      })
      const body: unknown = await response.json().catch((): null => null)
      if (!response.ok) {
        setNotice({ tone: 'error', text: errorMessageFrom(body, t('translations.errSave')) })
        return
      }
      const result = body as { updated?: number; skipped?: number; refused?: string[]; notified?: number }
      const refused = result.refused ?? []
      const parts = [t('translations.resultChanged', { done, count: result.updated ?? 0 })]
      if (result.skipped) parts.push(t('translations.resultSkipped', { count: result.skipped }))
      if (result.notified) parts.push(`${result.notified} notified`)
      setNotice({ tone: refused.length ? 'error' : 'ok', text: [parts.join(', ') + '.', ...refused].join(' ') })
      if ((result.updated ?? 0) > 0) setTimeout(() => window.location.reload(), 600)
    } catch {
      setNotice({ tone: 'error', text: t('translations.errReach') })
    } finally {
      setBusy(false)
    }
  }

  const keys = [...picked]

  // Clear inactive: count first (dry run), confirm with the number, then delete. Only orphaned rows are ever deleted.
  const clearInactive = async (payload: Record<string, unknown>): Promise<void> => {
    if (!props.clearApi) return
    setBusy(true)
    setNotice(null)
    try {
      const preview = await fetch(props.clearApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, action: 'clear-inactive', dryRun: true }),
      })
      const previewBody = (await preview.json().catch((): null => null)) as { count?: number; error?: string } | null
      if (!preview.ok) {
        setNotice({ tone: 'error', text: previewBody?.error ?? t('translations.errInactiveCheck') })
        return
      }
      const count = Number(previewBody?.count ?? 0)
      if (count === 0) {
        setNotice({ tone: 'ok', text: t('translations.noInactive') })
        return
      }
      const scope = payload.scope === 'all' ? t('translations.scopeAll') : t('translations.scopeSelected')
      const confirmed = window.confirm(
        count === 1
          ? t('translations.confirmClearOne', { count, scope })
          : t('translations.confirmClearOther', { count, scope }),
      )
      if (!confirmed) return
      const response = await fetch(props.clearApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...payload, action: 'clear-inactive' }),
      })
      const body = (await response.json().catch((): null => null)) as { deleted?: number; refused?: string[]; error?: string } | null
      if (!response.ok) {
        setNotice({ tone: 'error', text: body?.error ?? t('translations.errInactiveClear') })
        return
      }
      const refused = body?.refused ?? []
      setNotice({
        tone: refused.length ? 'error' : 'ok',
        text: [`Cleared ${body?.deleted ?? 0} inactive translation${body?.deleted === 1 ? '' : 's'}.`, ...refused.map((r) => `Could not remove ${r}.`)].join(' '),
      })
      if ((body?.deleted ?? 0) > 0) setTimeout(() => window.location.reload(), 600)
    } catch {
      setNotice({ tone: 'error', text: t('translations.errReach') })
    } finally {
      setBusy(false)
    }
  }

  const cell = (row: OverviewListRow, name: string) => {
    switch (name) {
      case 'title':
        return (
          <div className="flex flex-col gap-[2px]">
            <a
              className="list-link"
              href={row.editHref}
              title={row.mode === 'builder' ? t('translations.openBuilder') : t('translations.openEditor')}
              aria-current={props.selectedKey === row.key ? 'true' : undefined}
            >
              {row.title}
            </a>
            {row.inactive.length > 0 ? (
              <details className="text-[12px]">
                <summary className="cursor-pointer text-[var(--theme-elevation-600)]">
                  {t(row.inactiveCount === 1 ? 'translations.inactiveOne' : 'translations.inactiveOther', { count: row.inactiveCount })}
                </summary>
                <div className="mt-[4px] flex flex-col gap-[4px] rounded-[5px] border border-[var(--theme-elevation-150)] p-[8px]">
                  <p className="text-[var(--theme-elevation-600)]">{t('translations.inactiveNote')}</p>
                  <ul className="flex flex-col gap-[4px]">
                    {row.inactive.map((entry, index) => (
                      <li key={`${entry.locale}:${entry.fieldPath}:${index}`}>
                        <strong>{entry.localeLabel}</strong> · <code>{entry.fieldPath}</code> · {t(REASON_KEYS[entry.reason])}
                        <div className="text-[var(--theme-elevation-500)]">{entry.value}</div>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn self-start" disabled={busy} onClick={() => clearInactive({ scope: 'items', items: [row.key] })}>
                    Clear inactive for this page
                  </button>
                </div>
              </details>
            ) : null}
          </div>
        )
      case 'type':
        return row.typeLabel
      case 'url':
        return row.url ? (
          <a className="list-link text-[12px]" href={row.url} target="_blank" rel="noreferrer">
            {row.url}
          </a>
        ) : (
          '-'
        )
      case 'inactive':
        return row.inactiveCount > 0 ? <span className="whitespace-nowrap">{row.inactiveCount}</span> : '-'
      case 'progress':
        return (
          <span className="whitespace-nowrap">
            {row.progress}%
          </span>
        )
      case 'assignee':
        return row.assignees.length ? row.assignees.map((entry) => entry.label).join(', ') : '-'
      case 'updatedAt':
        return formatDateCell(row.updatedAt)
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-center gap-[8px] px-[4px] text-[13px]" role="toolbar" aria-label={t('translations.bulkActions')}>
        <span>{t('translations.selected', { count: keys.length })}</span>
        <button type="button" className="btn" disabled={busy || keys.length === 0} onClick={() => send({ action: 'approve', items: keys }, t('translations.statusApproved'))}>
          {t('translations.markApproved')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || keys.length === 0 || !props.clearApi}
          title={t('translations.clearInactiveHint')}
          onClick={() => clearInactive({ scope: 'items', items: keys })}
        >
          {t('translations.clearInactive')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || !props.clearApi}
          title={t('translations.clearAllInactiveHint')}
          onClick={() => clearInactive({ scope: 'all' })}
        >
          {t('translations.clearAllInactive')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || keys.length === 0}
          title={t('translations.translateMachineHint')}
          onClick={() => send({ action: 'translate', items: keys, overwrite }, t('translations.doneTranslated'))}
        >
          {t('translations.translateMachine')}
        </button>
        <label className="flex items-center gap-[4px]">
          <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
          {t('translations.overwrite')}
        </label>
        <details>
          <summary className="cursor-pointer">{t('translations.assignTo')}</summary>
          <div className="mt-[6px] flex flex-col gap-[4px] rounded-[5px] border border-[var(--theme-elevation-150)] p-[8px]">
            {props.users.length === 0 ? <span>{t('translations.noUsers')}</span> : null}
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
            <button
              type="button"
              className="btn"
              disabled={busy || keys.length === 0}
              onClick={() => send({ action: 'assign', items: keys, assignees }, t('translations.doneAssigned'))}
            >
              {t('translations.assignSelected')}
            </button>
            <button
              type="button"
              className="text-[12px] underline"
              disabled={busy || keys.length === 0}
              onClick={() => send({ action: 'assign', items: keys, assignees: [] }, t('translations.doneCleared'))}
            >
              {t('translations.clearAssignment')}
            </button>
          </div>
        </details>
      </div>

      {notice ? (
        <p role="status" className={`px-[4px] text-[13px] ${notice.tone === 'error' ? 'text-[var(--theme-error-500,#dc2626)]' : ''}`}>
          {notice.text}
        </p>
      ) : null}

      {!props.hasRows ? (
        <p className="list-empty">{t('translations.emptyNone')}</p>
      ) : props.emptyFiltered ? (
        <p className="list-empty">{t('translations.emptyFiltered')}</p>
      ) : (
        <div className="list-table-wrapper">
          <table className="list-table">
            <thead>
              <tr>
                <th className="list-th">
                  <input
                    type="checkbox"
                    aria-label={t('translations.selectAllPage')}
                    checked={allSelected}
                    onChange={(event) =>
                      setPicked(event.target.checked ? new Set(props.rows.map((row) => row.key)) : new Set())
                    }
                  />
                </th>
                {props.visibleNames
                  .filter((name) => !name.startsWith('lang:'))
                  .map((name) => (
                    <th key={name} className="list-th">
                      {SORTABLE.has(name) && props.sortLinks[name] ? (
                        <a className="list-sort-link" href={props.sortLinks[name]}>
                          {columnLabel(name)}
                          {props.sortState === name ? ' ▲' : props.sortState === `-${name}` ? ' ▼' : ''}
                        </a>
                      ) : (
                        columnLabel(name)
                      )}
                    </th>
                  ))}
                {langColumns.map((code) => (
                  <th key={code} className="list-th">
                    {props.localeLabels[code] ?? code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.key} className="list-row">
                  <td className="list-td">
                    <input type="checkbox" aria-label={`Select ${row.title}`} checked={picked.has(row.key)} onChange={() => toggle(row.key)} />
                  </td>
                  {props.visibleNames
                    .filter((name) => !name.startsWith('lang:'))
                    .map((name) => (
                      <td key={name} className="list-td">
                        {cell(row, name)}
                      </td>
                    ))}
                  {langColumns.map((code) => {
                    const entry = row.cells.find((candidate) => candidate.locale === code)
                    return (
                      <td key={code} className="list-td">
                        {entry ? (
                          <a
                            href={entry.href}
                            className="inline-flex no-underline"
                            title={t('translations.entryApproved', { approved: entry.approved, total: entry.total, hint: entry.mode === 'builder' ? t('translations.hintOpenPage') : t('translations.hintOpenEditor') })}
                          >
                            <span className="whitespace-nowrap">
                              <TranslationStatusBadge status={entry.status} label={entry.statusLabel} />
                              <span className="ml-[4px] text-[12px] tabular-nums">
                                {entry.approved}/{entry.total}
                              </span>
                            </span>
                          </a>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {props.totalPages > 1 ? (
        <div className="list-pagination">
          {props.prevHref ? <a className="list-pagination-btn" href={props.prevHref}>{t('list.previous')}</a> : null}
          <span className="list-pagination-info">
            {t('translations.pageOf', { page: props.page, total: props.totalPages })}
          </span>
          {props.nextHref ? <a className="list-pagination-btn" href={props.nextHref}>{t('list.next')}</a> : null}
          <span className="list-pagination-total">{t('translations.total', { total: props.totalMatching })}</span>
        </div>
      ) : null}
    </div>
  )
}

export default TranslationsOverview
