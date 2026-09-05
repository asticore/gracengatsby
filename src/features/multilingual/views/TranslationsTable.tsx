'use client'

import React, { useCallback, useMemo, useState } from 'react'

import { INTERFACE_GROUPS } from '../interfaceStrings'
import { localeLabel, localeNativeName } from '../locales'
import type { LocaleProgress, TranslationTableRow, DocumentOption } from './translationsData'

/**
 * The table itself.
 *
 * One row per string, one column per language, edited in place - which is the
 * whole point of the screen. The alternative every CMS reaches for first is
 * "open each document in each language", and that is the thing that makes
 * translation feel like a fortnight's work instead of an afternoon's.
 *
 * Edits are held locally and saved together. Saving on blur would be fewer
 * clicks and would also mean a translator who tabs through forty cells fires
 * forty requests and cannot undo any of them; one Save is honest about what
 * has and has not been written down.
 */

export type TranslationsTableProps = {
  rows: TranslationTableRow[]
  targetLocales: string[]
  sourceLocale: string
  progress: LocaleProgress[]
  collections: { slug: string; label: string }[]
  documents: DocumentOption[]
  scope: string
  documentId: string | null
  group: string | null
  apiBase: string
}

type Draft = Record<string, string>

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const cellKey = (rowKey: string, locale: string): string => `${rowKey}::${locale}`

const filterLabelClassName = 'flex flex-col gap-[calc(var(--base)*0.25)]'
const cellBaseClassName = 'border-b border-[var(--theme-elevation-100)] p-[calc(var(--base)*0.5)] text-left align-top'
const headClassName = `${cellBaseClassName} sticky top-0 z-[2] bg-[var(--theme-elevation-50)]`
const rowHeaderClassName = `${cellBaseClassName} min-w-[200px] max-w-[280px]`
const sourceCellClassName = `${cellBaseClassName} min-w-[200px] max-w-[280px] whitespace-pre-wrap text-[var(--theme-elevation-700)]`
const inputClassName =
  'w-full min-w-[180px] rounded-[var(--style-radius-s)] border border-[var(--theme-elevation-150)] bg-[var(--theme-input-bg,var(--theme-base-0))] p-[calc(var(--base)*0.35)] text-inherit [font:inherit]'
const staleInputStyle: React.CSSProperties = { borderLeft: '3px solid var(--theme-warning-500)' }

/** Rewrites the current URL's filters without a client-side router. */
function setParams(next: Record<string, string | null>): void {
  const url = new URL(window.location.href)
  for (const [name, value] of Object.entries(next)) {
    if (value === null || value === '') url.searchParams.delete(name)
    else url.searchParams.set(name, value)
  }
  window.location.href = url.toString()
}

export const TranslationsTable: React.FC<TranslationsTableProps> = ({
  rows,
  targetLocales,
  sourceLocale,
  progress,
  collections,
  documents,
  scope,
  documentId,
  group,
  apiBase,
}) => {
  const [draft, setDraft] = useState<Draft>({})
  const [missingOnly, setMissingOnly] = useState(false)
  const [state, setState] = useState<SaveState>('idle')
  const [message, setMessage] = useState('')

  const valueOf = useCallback(
    (rowKey: string, locale: string, stored: string): string => {
      const key = cellKey(rowKey, locale)
      return key in draft ? draft[key] : stored
    },
    [draft],
  )

  const dirtyCount = Object.keys(draft).length

  const visibleRows = useMemo(() => {
    if (!missingOnly) return rows
    return rows.filter((row) =>
      row.cells.some((cell) => valueOf(row.key, cell.locale, cell.value).trim().length === 0),
    )
  }, [missingOnly, rows, valueOf])

  const onSave = useCallback(async () => {
    if (dirtyCount === 0) return
    setState('saving')
    setMessage('')

    const byKey = new Map(rows.map((row) => [row.key, row]))
    let written = 0
    const failures: string[] = []

    for (const [key, value] of Object.entries(draft)) {
      const [rowKey, locale] = key.split('::')
      const row = byKey.get(rowKey)
      if (!row) continue
      const cell = row.cells.find((entry) => entry.locale === locale)

      const body = {
        locale,
        sourceKind: row.sourceKind,
        sourceId: row.sourceId,
        fieldPath: row.fieldPath,
        value,
        // Stamped on every save so the stale marker is measured against what
        // the translator actually had in front of them.
        sourceText: row.sourceText,
      }

      try {
        const response = await fetch(cell?.id ? `${apiBase}/${cell.id}` : apiBase, {
          method: cell?.id ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cell?.id ? { value, sourceText: row.sourceText } : body),
        })
        if (!response.ok) throw new Error(String(response.status))
        written += 1
      } catch {
        failures.push(`${row.label} (${locale})`)
      }
    }

    if (failures.length > 0) {
      setState('error')
      setMessage(`Saved ${written}. Could not save: ${failures.slice(0, 3).join(', ')}${failures.length > 3 ? '…' : ''}`)
      return
    }

    setState('saved')
    setMessage(`Saved ${written} translation${written === 1 ? '' : 's'}.`)
    // Reload rather than merge the response in: a saved cell gains a row id
    // and loses its stale marker, and re-deriving that here would be a second
    // copy of logic the loader already has.
    window.location.reload()
  }, [apiBase, dirtyCount, draft, rows])

  return (
    <div className="flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)]">
      <header className="flex flex-wrap items-start justify-between gap-[var(--base)]">
        <div>
          <h1>Translations</h1>
          <p className="mt-[calc(var(--base)*0.25)] mx-0 mb-0 text-[var(--theme-elevation-600)]">
            Everything written in {localeLabel(sourceLocale)} on the left, one column per language to fill in.
          </p>
        </div>
        <div className="flex items-center gap-[var(--base)]">
          <label className="inline-flex items-center gap-[calc(var(--base)*0.4)] whitespace-nowrap">
            <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
            Missing only
          </label>
          <button
            type="button"
            className="cursor-pointer rounded-[var(--style-radius-s)] border border-[var(--theme-elevation-150)] bg-[var(--theme-success-500)] px-[var(--base)] py-[calc(var(--base)*0.5)] text-[var(--theme-base-0)] disabled:cursor-default disabled:bg-[var(--theme-elevation-100)] disabled:text-[var(--theme-elevation-500)]"
            disabled={dirtyCount === 0 || state === 'saving'}
            onClick={onSave}
          >
            {state === 'saving' ? 'Saving…' : dirtyCount === 0 ? 'Saved' : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </header>

      {message ? (
        <p
          className={`m-0 rounded-[var(--style-radius-s)] px-[var(--base)] py-[calc(var(--base)*0.5)] ${
            state === 'error'
              ? 'bg-[color-mix(in_srgb,var(--theme-error-500)_12%,transparent)] text-[var(--theme-error-600)]'
              : 'bg-[var(--theme-elevation-50)]'
          }`}
        >
          {message}
        </p>
      ) : null}

      <section className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[var(--base)]" aria-label="Progress per language">
        {progress.map((entry) => {
          const percent = entry.total > 0 ? Math.round((entry.translated / entry.total) * 100) : 0
          return (
            <div key={entry.locale} className="flex flex-col gap-[calc(var(--base)*0.25)] rounded-[var(--style-radius-m)] border border-[var(--theme-elevation-100)] p-[calc(var(--base)*0.6)]">
              <div className="flex justify-between font-semibold">
                <span>{localeLabel(entry.locale)}</span>
                <span>{percent}%</span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-[3px] bg-[var(--theme-elevation-100)]">
                <div className="h-full bg-[var(--theme-success-500)]" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-[0.85em] text-[var(--theme-elevation-500)]">
                {entry.translated} of {entry.total} strings
              </span>
            </div>
          )
        })}
      </section>

      <div className="flex flex-wrap gap-[var(--base)]">
        <label className={filterLabelClassName}>
          What
          <select value={scope} onChange={(event) => setParams({ scope: event.target.value, doc: null, group: null })}>
            <option value="interface">Interface strings</option>
            {collections.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        {scope === 'interface' ? (
          <label className={filterLabelClassName}>
            Area
            <select value={group ?? ''} onChange={(event) => setParams({ group: event.target.value || null })}>
              <option value="">All areas</option>
              {INTERFACE_GROUPS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={filterLabelClassName}>
            Item
            <select value={documentId ?? ''} onChange={(event) => setParams({ doc: event.target.value || null })}>
              <option value="">Choose an item…</option>
              {documents.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-[var(--style-radius-m)] border border-dashed border-[var(--theme-elevation-150)] p-[calc(var(--base)*2)] text-center text-[var(--theme-elevation-600)]">
          {scope !== 'interface' && !documentId
            ? 'Pick an item above to see its translatable fields.'
            : missingOnly
              ? 'Nothing missing here - every string in this view has been translated.'
              : 'Nothing to translate in this view.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--style-radius-m)] border border-[var(--theme-elevation-100)]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={headClassName} scope="col">
                  String
                </th>
                <th className={headClassName} scope="col">
                  {localeLabel(sourceLocale)}
                </th>
                {targetLocales.map((locale) => (
                  <th key={locale} className={headClassName} scope="col" lang={locale}>
                    <span>{localeLabel(locale)}</span>
                    <small className="block font-normal text-[var(--theme-elevation-500)]">
                      {localeNativeName(locale)}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <th className={rowHeaderClassName} scope="row">
                    <span className="block text-[0.85em] [font-family:var(--font-mono,monospace)]">{row.label}</span>
                    <small className="block text-[0.8em] font-normal text-[var(--theme-elevation-500)]">{row.hint}</small>
                  </th>
                  <td className={sourceCellClassName}>{row.sourceText}</td>
                  {row.cells.map((cell) => {
                    const current = valueOf(row.key, cell.locale, cell.value)
                    const dirty = cellKey(row.key, cell.locale) in draft
                    const stale = cell.stale && !dirty
                    return (
                      <td key={cell.locale} className={cellBaseClassName}>
                        {row.multiline ? (
                          <textarea
                            className={inputClassName}
                            lang={cell.locale}
                            rows={3}
                            style={stale ? staleInputStyle : undefined}
                            value={current}
                            placeholder="Not translated"
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, [cellKey(row.key, cell.locale)]: event.target.value }))
                            }
                          />
                        ) : (
                          <input
                            className={inputClassName}
                            lang={cell.locale}
                            type="text"
                            style={stale ? staleInputStyle : undefined}
                            value={current}
                            placeholder="Not translated"
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, [cellKey(row.key, cell.locale)]: event.target.value }))
                            }
                          />
                        )}
                        {stale ? (
                          <small className="block text-[0.8em] font-normal text-[var(--theme-elevation-500)]">
                            Source has changed since this was written.
                          </small>
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
    </div>
  )
}
