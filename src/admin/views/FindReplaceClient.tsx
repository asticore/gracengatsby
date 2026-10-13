'use client'

import React, { useState } from 'react'
import './find-replace.css'
import type { FindReplaceCollection, FindReplaceOptions } from '@/features/editScreens/findReplace'

type Place = { key: FindReplaceCollection; label: string }

type Sample = { collection: FindReplaceCollection; title: string; field: string; before: string; match: string; after: string }

type PreviewResult = {
  matches: number
  documents: number
  perCollection: Record<FindReplaceCollection, { documents: number; matches: number }>
  samples: Sample[]
  truncated: boolean
  sampleLimit: number
}

type ApplyResult = { matches: number; updated: number; refused: number; message: string }

async function callTool(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/admin-find-replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch((): null => null)) as Record<string, unknown> | null
    if (!res.ok) return { ok: false, error: typeof data?.error === 'string' ? data.error : 'Something went wrong. Try again.' }
    return { ok: true, data: data ?? {} }
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' }
  }
}

/** Plain-English one-line summary of what a preview would change. */
function summaryLine(preview: PreviewResult): string {
  if (preview.matches === 0) return 'Nothing matches. Nothing would be changed.'
  const items = `${preview.documents} ${preview.documents === 1 ? 'item' : 'items'}`
  return `${preview.matches} ${preview.matches === 1 ? 'match' : 'matches'} in ${items}.`
}

export function FindReplaceClient({ collections }: { collections: Place[] }) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [picked, setPicked] = useState<FindReplaceCollection[]>(collections.map((place) => place.key))
  const [preview, setPreview] = useState<{ key: string; result: PreviewResult } | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<ApplyResult | null>(null)

  const options: FindReplaceOptions = { find, replace, caseSensitive, wholeWord, collections: picked }
  const currentKey = JSON.stringify(options)
  // A preview only applies to the exact options it was made from. Any edit makes it stale.
  const fresh = preview !== null && preview.key === currentKey ? preview.result : null

  const runPreview = async () => {
    setBusy('preview')
    setError(null)
    setApplied(null)
    const outcome = await callTool({ mode: 'preview', ...options })
    setBusy(null)
    if ('error' in outcome) {
      setPreview(null)
      setError(outcome.error)
      return
    }
    setPreview({ key: currentKey, result: outcome.data as unknown as PreviewResult })
  }

  const runApply = async () => {
    if (!fresh) return
    setBusy('apply')
    setError(null)
    const outcome = await callTool({ mode: 'apply', expect: fresh.matches, ...options })
    setBusy(null)
    setPreview(null)
    if ('error' in outcome) {
      setError(outcome.error)
      return
    }
    setApplied({
      matches: Number(outcome.data.matches) || 0,
      updated: Number(outcome.data.updated) || 0,
      refused: Number(outcome.data.refused) || 0,
      message: typeof outcome.data.message === 'string' ? outcome.data.message : 'Done.',
    })
  }

  const togglePlace = (key: FindReplaceCollection) => {
    setPicked((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
  }

  const canPreview = find.trim() !== '' && picked.length > 0 && busy === null
  const confirmLabel = fresh ? (fresh.matches === 1 ? 'Replace 1 match' : `Replace ${fresh.matches} matches`) : ''

  return (
    <div className="fr-page">
      <header className="fr-header">
        <h1 className="fr-title">Find and replace</h1>
        <p className="fr-intro">
          Change a word or phrase across your content. You see every match first, and nothing changes until you confirm.
          Only the text on the page is changed. Links, images and layout stay as they are.
        </p>
      </header>

      <section className="fr-card" aria-labelledby="fr-form-heading">
        <h2 className="fr-heading" id="fr-form-heading">What to change</h2>
        <div className="fr-field">
          <label className="fr-label" htmlFor="fr-find">Find this text</label>
          <input
            className="fr-input"
            id="fr-find"
            maxLength={200}
            onChange={(event) => setFind(event.target.value)}
            title="The exact text to look for. Spaces count."
            type="text"
            value={find}
          />
        </div>
        <div className="fr-field">
          <label className="fr-label" htmlFor="fr-replace">Replace it with</label>
          <input
            className="fr-input"
            id="fr-replace"
            maxLength={500}
            onChange={(event) => setReplace(event.target.value)}
            title="Leave this empty to delete the found text."
            type="text"
            value={replace}
          />
        </div>

        <fieldset className="fr-fieldset">
          <legend className="fr-label">Options</legend>
          <label className="fr-check">
            <input checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} type="checkbox" />
            Match upper and lower case
          </label>
          <label className="fr-check" title="Only match the text as a whole word, not inside a longer word.">
            <input checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} type="checkbox" />
            Whole words only
          </label>
        </fieldset>

        <fieldset className="fr-fieldset">
          <legend className="fr-label">Where to look</legend>
          {collections.map((place) => (
            <label className="fr-check" key={place.key}>
              <input checked={picked.includes(place.key)} onChange={() => togglePlace(place.key)} type="checkbox" />
              {place.label}
            </label>
          ))}
        </fieldset>

        <div className="fr-actions">
          <button className="fr-button" disabled={!canPreview} onClick={runPreview} type="button">
            {busy === 'preview' ? 'Searching...' : 'Preview matches'}
          </button>
        </div>
      </section>

      {error && <p className="fr-error" role="alert">{error}</p>}

      {fresh && (
        <section className="fr-card" aria-live="polite" aria-labelledby="fr-preview-heading">
          <h2 className="fr-heading" id="fr-preview-heading">Preview</h2>
          <p className="fr-summary">{summaryLine(fresh)}</p>
          <ul className="fr-counts">
            {collections
              .filter((place) => picked.includes(place.key))
              .map((place) => (
                <li key={place.key}>
                  {place.label}: {fresh.perCollection[place.key]?.matches ?? 0} in {fresh.perCollection[place.key]?.documents ?? 0}
                </li>
              ))}
          </ul>
          {fresh.truncated && (
            <p className="fr-note">Only the first part of the content was checked. Search fewer places to see every match.</p>
          )}
          {fresh.samples.length > 0 && (
            <>
              <p className="fr-note">Showing up to {fresh.sampleLimit} matches.</p>
              <ol className="fr-samples">
                {fresh.samples.map((sample, index) => (
                  <li className="fr-sample" key={index}>
                    <span className="fr-sample-place">{sample.collection} | {sample.title} | {sample.field}</span>
                    <span className="fr-sample-text">
                      {sample.before}
                      <mark className="fr-mark">{sample.match}</mark>
                      {sample.after}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {fresh.matches > 0 && (
            <div className="fr-actions">
              <button className="fr-button fr-button-danger" disabled={busy !== null} onClick={runApply} type="button">
                {busy === 'apply' ? 'Replacing...' : confirmLabel}
              </button>
              <button className="fr-button fr-button-quiet" disabled={busy !== null} onClick={() => setPreview(null)} type="button">
                Cancel
              </button>
            </div>
          )}
        </section>
      )}

      {applied && (
        <section className="fr-card" aria-live="polite">
          <h2 className="fr-heading">Done</h2>
          <p className="fr-summary">{applied.message}</p>
          {applied.refused > 0 && <p className="fr-note">Some items were refused, usually because of a lock or the role rules. Check them one at a time.</p>}
        </section>
      )}
    </div>
  )
}