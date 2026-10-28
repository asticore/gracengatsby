'use client'

import React, { useState } from 'react'

import { formatDateCell } from '@/admin/list/dateFormatter'

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
  editHref: string
  cells: Array<{ locale: string; status: TranslationStatus; statusLabel: string; approved: number; total: number }>
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
const COLUMN_LABELS: Record<string, string> = {
  title: 'Item',
  type: 'Type',
  progress: 'Progress',
  assignee: 'Assigned to',
  updatedAt: 'Updated',
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

export function TranslationsOverview(props: TranslationsOverviewProps) {
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
        setNotice({ tone: 'error', text: errorMessageFrom(body, 'The change could not be saved.') })
        return
      }
      const result = body as { updated?: number; skipped?: number; refused?: string[]; notified?: number }
      const refused = result.refused ?? []
      const parts = [`${done}: ${result.updated ?? 0} changed`]
      if (result.skipped) parts.push(`${result.skipped} left as they were`)
      if (result.notified) parts.push(`${result.notified} notified`)
      setNotice({ tone: refused.length ? 'error' : 'ok', text: [parts.join(', ') + '.', ...refused].join(' ') })
      if ((result.updated ?? 0) > 0) setTimeout(() => window.location.reload(), 600)
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  const keys = [...picked]

  const cell = (row: OverviewListRow, name: string) => {
    switch (name) {
      case 'title':
        return (
          <a className="list-link" href={row.editHref} aria-current={props.selectedKey === row.key ? 'true' : undefined}>
            {row.title}
          </a>
        )
      case 'type':
        return row.typeLabel
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
      <div className="flex flex-wrap items-center gap-[8px] px-[4px] text-[13px]" role="toolbar" aria-label="Bulk actions">
        <span>{keys.length} selected</span>
        <button type="button" className="btn" disabled={busy || keys.length === 0} onClick={() => send({ action: 'approve', items: keys }, 'Approved')}>
          Mark approved
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || keys.length === 0}
          title="Writes machine drafts for the empty or changed fields. Up to 100 items at a time."
          onClick={() => send({ action: 'translate', items: keys, overwrite }, 'Translated with machine')}
        >
          Translate with machine
        </button>
        <label className="flex items-center gap-[4px]">
          <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
          Overwrite approved and human text
        </label>
        <details>
          <summary className="cursor-pointer">Assign to…</summary>
          <div className="mt-[6px] flex flex-col gap-[4px] rounded-[5px] border border-[var(--theme-elevation-150)] p-[8px]">
            {props.users.length === 0 ? <span>No users to assign.</span> : null}
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
              onClick={() => send({ action: 'assign', items: keys, assignees }, 'Assigned')}
            >
              Assign selected
            </button>
            <button
              type="button"
              className="text-[12px] underline"
              disabled={busy || keys.length === 0}
              onClick={() => send({ action: 'assign', items: keys, assignees: [] }, 'Assignments cleared')}
            >
              Clear assignment (use the language rules)
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
        <p className="list-empty">Nothing to translate yet. Add pages, posts, products, events or FAQs, and interface strings will appear here.</p>
      ) : props.emptyFiltered ? (
        <p className="list-empty">No items match this search or filter.</p>
      ) : (
        <div className="list-table-wrapper">
          <table className="list-table">
            <thead>
              <tr>
                <th className="list-th">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
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
                          {COLUMN_LABELS[name] ?? name}
                          {props.sortState === name ? ' ▲' : props.sortState === `-${name}` ? ' ▼' : ''}
                        </a>
                      ) : (
                        COLUMN_LABELS[name] ?? name
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
                          <span title={`${entry.approved} of ${entry.total} approved`}>
                            <TranslationStatusBadge status={entry.status} label={entry.statusLabel} />
                          </span>
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
          {props.prevHref ? <a className="list-pagination-btn" href={props.prevHref}>Prev</a> : null}
          <span className="list-pagination-info">
            Page {props.page} of {props.totalPages}
          </span>
          {props.nextHref ? <a className="list-pagination-btn" href={props.nextHref}>Next</a> : null}
          <span className="list-pagination-total">Total: {props.totalMatching}</span>
        </div>
      ) : null}
    </div>
  )
}

export default TranslationsOverview
