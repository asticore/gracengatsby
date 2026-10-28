'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import type { AuthorOption } from '../authors'
import type { BulkAction, BulkRowResult, CategoryMode } from '../bulk'
import './edit-screens.css'

export type BulkBarProps = {
  collection: 'pages' | 'posts' | 'events'
  /** The trash view lists trashed items only; its actions are Restore and Delete for good. */
  trashView: boolean
  canPublish: boolean
  canDelete: boolean
  canChangeAuthor: boolean
  /** Singular label for messages: "page", "post", "event". */
  noun: string
}

type Choice = { value: BulkAction; label: string }

/** The actions offered, by view and permission. The server checks them again for the whole request and for every row. */
export function bulkChoices(props: Pick<BulkBarProps, 'collection' | 'trashView' | 'canPublish' | 'canDelete' | 'canChangeAuthor'>): Choice[] {
  if (props.trashView) {
    const trashChoices: Choice[] = []
    if (props.canDelete) trashChoices.push({ value: 'restore', label: 'Restore' }, { value: 'delete', label: 'Delete permanently' })
    return trashChoices
  }
  const choices: Choice[] = []
  if (props.canPublish) choices.push({ value: 'publish', label: 'Publish' }, { value: 'unpublish', label: 'Switch to draft' })
  if (props.canDelete) choices.push({ value: 'trash', label: 'Move to trash' })
  if (props.canChangeAuthor) choices.push({ value: 'changeAuthor', label: 'Change author' })
  if (props.collection === 'posts') choices.push({ value: 'changeCategory', label: 'Change category' })
  return choices
}

const selectedBoxes = (): HTMLInputElement[] => Array.from(document.querySelectorAll<HTMLInputElement>('input[data-bulk-row]:checked'))

/**
 * Bulk actions above a list. The row checkboxes are plain inputs the list view
 * renders (`data-bulk-row`, one `data-bulk-all` in the header), so the table
 * itself stays a server component; this bar listens for changes to them.
 * Nothing runs until the user confirms; the result says how many rows changed
 * and lists each row that was refused with its reason.
 */
export function BulkActionsBar(props: BulkBarProps) {
  const t = useAdminT()
  const router = useRouter()
  const choices = bulkChoices(props)
  const [selected, setSelected] = useState<Array<{ id: number; label: string }>>([])
  const [action, setAction] = useState<BulkAction | ''>('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<{ message: string; failures: Array<{ label: string; error: string }> } | null>(null)
  const [authors, setAuthors] = useState<AuthorOption[] | null>(null)
  const [author, setAuthor] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryMode, setCategoryMode] = useState<CategoryMode>('add')

  useEffect(() => {
    const sync = (event: Event) => {
      const target = event.target as HTMLInputElement | null
      if (!target || target.tagName !== 'INPUT') return
      if (target.hasAttribute('data-bulk-all')) {
        for (const box of document.querySelectorAll<HTMLInputElement>('input[data-bulk-row]')) box.checked = target.checked
      } else if (!target.hasAttribute('data-bulk-row')) {
        return
      }
      setSelected(selectedBoxes().map((box) => ({ id: Number(box.value), label: box.getAttribute('data-bulk-label') ?? `#${box.value}` })))
      setConfirming(false)
    }
    document.addEventListener('change', sync)
    return () => document.removeEventListener('change', sync)
  }, [])

  if (choices.length === 0) return null

  const choose = (next: BulkAction | '') => {
    setAction(next)
    setConfirming(false)
    setError(null)
    if (next === 'changeAuthor' && authors === null) {
      fetch(`/api/admin-authors?collection=${props.collection}`, { credentials: 'same-origin' })
        .then(async (response) => {
          if (!response.ok) throw new Error('forbidden')
          return (await response.json()) as { authors: AuthorOption[] }
        })
        .then((body) => setAuthors(body.authors))
        .catch(() => setError('The list of authors could not be loaded.'))
    }
  }

  const chosen = choices.find((choice) => choice.value === action)
  const ready =
    selected.length > 0 &&
    action !== '' &&
    (action !== 'changeAuthor' || author !== '') &&
    (action !== 'changeCategory' || categoryName.trim() !== '')

  const plural = selected.length === 1 ? props.noun : `${props.noun}s`
  const confirmText = (() => {
    const what = `${selected.length} ${plural}`
    switch (action) {
      case 'publish':
        return `Publish ${what}? They go live on the site straight away.`
      case 'unpublish':
        return `Switch ${what} to draft? They disappear from the public site.`
      case 'trash':
        return `Move ${what} to the trash? They come off the public site and you can restore them from the trash.`
      case 'restore':
        return `Restore ${what}? They come back as drafts.`
      case 'delete':
        return `Delete ${what} permanently? This cannot be undone.`
      case 'changeAuthor':
        return `Change the author of ${what} to ${authors?.find((a) => String(a.id) === author)?.name ?? 'the chosen person'}?`
      case 'changeCategory':
        return `${categoryMode === 'add' ? 'Add' : categoryMode === 'remove' ? 'Remove' : 'Set only'} the category "${categoryName.trim()}" on ${what}?`
      default:
        return ''
    }
  })()

  const run = async () => {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const body: Record<string, unknown> = { collection: props.collection, ids: selected.map((row) => row.id), action }
      if (action === 'changeAuthor') body.author = Number(author)
      if (action === 'changeCategory') body.category = { name: categoryName.trim(), mode: categoryMode }
      const response = await fetch('/api/admin-bulk', {
        body: JSON.stringify(body),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const data = (await response.json().catch((): null => null)) as { message?: string; error?: string; results?: BulkRowResult[] } | null
      if (!response.ok || !data) {
        setError(data?.error ?? 'The change could not be made.')
        return
      }
      const labels = new Map(selected.map((row) => [row.id, row.label]))
      setReport({
        message: data.message ?? 'Done.',
        failures: (data.results ?? []).filter((row) => !row.ok).map((row) => ({ label: labels.get(row.id) ?? `#${row.id}`, error: row.error ?? 'Refused.' })),
      })
      for (const box of document.querySelectorAll<HTMLInputElement>('input[data-bulk-row], input[data-bulk-all]')) box.checked = false
      setSelected([])
      setConfirming(false)
      setAction('')
      router.refresh()
    } catch {
      setError('The change could not be made. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div aria-label={t('common.bulkActions')} className="es-bulk" role="region">
      <span className="es-bulk__count" aria-live="polite">
        {selected.length === 0 ? `Select ${props.noun}s with the boxes` : `${selected.length} selected`}
      </span>
      <label>
        <span className="es-sr">Action</span>
        <select disabled={busy} onChange={(event) => choose(event.target.value as BulkAction | '')} value={action}>
          <option value="">Choose an action</option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>
      {action === 'changeAuthor' && (
        <label>
          <span className="es-sr">New author</span>
          <select disabled={busy || authors === null} onChange={(event) => setAuthor(event.target.value)} value={author}>
            <option value="">{authors === null ? 'Loading...' : 'Choose the new author'}</option>
            {(authors ?? []).map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {action === 'changeCategory' && (
        <>
          <label>
            <span className="es-sr">What to do</span>
            <select disabled={busy} onChange={(event) => setCategoryMode(event.target.value as CategoryMode)} value={categoryMode}>
              <option value="add">Add category</option>
              <option value="replace">Set as the only category</option>
              <option value="remove">Remove category</option>
            </select>
          </label>
          <label>
            <span className="es-sr">Category name</span>
            <input disabled={busy} maxLength={80} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" type="text" value={categoryName} />
          </label>
        </>
      )}
      {!confirming && (
        <button className="btn" disabled={!ready || busy} onClick={() => setConfirming(true)} type="button">
          Apply{chosen ? `: ${chosen.label}` : ''}
        </button>
      )}
      {confirming && ready && (
        <div className={`es-bulk__confirm${action === 'delete' ? ' es-bulk__confirm--danger' : ''}`} role="alertdialog" aria-label="Confirm bulk action">
          <p style={{ margin: '0 0 8px 0' }}>{confirmText}</p>
          <button className={action === 'delete' ? 'btn btn--primary doc-link--danger' : 'btn btn--primary'} disabled={busy} onClick={run} type="button">
            {busy ? 'Working...' : 'Yes, do it'}
          </button>{' '}
          <button className="btn" disabled={busy} onClick={() => setConfirming(false)} type="button">
            {t('common.cancel')}
          </button>
        </div>
      )}
      {error && (
        <p className="es-bulk__result" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="es-bulk__result" role="status">
          {report.message}
          {report.failures.length > 0 && (
            <ul>
              {report.failures.map((failure, index) => (
                <li key={index}>
                  {failure.label}: {failure.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default BulkActionsBar
