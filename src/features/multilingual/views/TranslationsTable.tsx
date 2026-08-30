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
    <div className="eg-translations">
      <header className="eg-translations__head">
        <div>
          <h1>Translations</h1>
          <p className="eg-translations__sub">
            Everything written in {localeLabel(sourceLocale)} on the left, one column per language to fill in.
          </p>
        </div>
        <div className="eg-translations__actions">
          <label className="eg-translations__toggle">
            <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
            Missing only
          </label>
          <button
            type="button"
            className="eg-translations__save"
            disabled={dirtyCount === 0 || state === 'saving'}
            onClick={onSave}
          >
            {state === 'saving' ? 'Saving…' : dirtyCount === 0 ? 'Saved' : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </header>

      {message ? (
        <p className={`eg-translations__message eg-translations__message--${state}`}>{message}</p>
      ) : null}

      <section className="eg-translations__progress" aria-label="Progress per language">
        {progress.map((entry) => {
          const percent = entry.total > 0 ? Math.round((entry.translated / entry.total) * 100) : 0
          return (
            <div key={entry.locale} className="eg-translations__meter">
              <div className="eg-translations__meter-label">
                <span>{localeLabel(entry.locale)}</span>
                <span>{percent}%</span>
              </div>
              <div className="eg-translations__meter-track">
                <div className="eg-translations__meter-fill" style={{ width: `${percent}%` }} />
              </div>
              <span className="eg-translations__meter-count">
                {entry.translated} of {entry.total} strings
              </span>
            </div>
          )
        })}
      </section>

      <div className="eg-translations__filters">
        <label>
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
          <label>
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
          <label>
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
        <p className="eg-translations__empty">
          {scope !== 'interface' && !documentId
            ? 'Pick an item above to see its translatable fields.'
            : missingOnly
              ? 'Nothing missing here - every string in this view has been translated.'
              : 'Nothing to translate in this view.'}
        </p>
      ) : (
        <div className="eg-translations__scroll">
          <table className="eg-translations__table">
            <thead>
              <tr>
                <th scope="col">String</th>
                <th scope="col">{localeLabel(sourceLocale)}</th>
                {targetLocales.map((locale) => (
                  <th key={locale} scope="col" lang={locale}>
                    <span>{localeLabel(locale)}</span>
                    <small>{localeNativeName(locale)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    <span className="eg-translations__label">{row.label}</span>
                    <small className="eg-translations__hint">{row.hint}</small>
                  </th>
                  <td className="eg-translations__source">{row.sourceText}</td>
                  {row.cells.map((cell) => {
                    const current = valueOf(row.key, cell.locale, cell.value)
                    const dirty = cellKey(row.key, cell.locale) in draft
                    return (
                      <td key={cell.locale} className={cell.stale && !dirty ? 'is-stale' : undefined}>
                        {row.multiline ? (
                          <textarea
                            lang={cell.locale}
                            rows={3}
                            value={current}
                            placeholder="Not translated"
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, [cellKey(row.key, cell.locale)]: event.target.value }))
                            }
                          />
                        ) : (
                          <input
                            lang={cell.locale}
                            type="text"
                            value={current}
                            placeholder="Not translated"
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, [cellKey(row.key, cell.locale)]: event.target.value }))
                            }
                          />
                        )}
                        {cell.stale && !dirty ? (
                          <small className="eg-translations__stale">Source has changed since this was written.</small>
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
