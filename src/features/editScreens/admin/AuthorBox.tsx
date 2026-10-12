'use client'

import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

import type { AuthorOption } from '../authors'
import './edit-screens.css'

/**
 * Author box in the edit screen's side panel. Only rendered for an
 * administrator or a role that can edit other people's work; the server checks
 * the same rule again (/api/admin-authors). Saves on its own, separately from
 * the document, so it never mixes with unsaved edits in the form.
 */
export function AuthorBox({ collection, id, authorId, authorName }: { collection: string; id: number; authorId?: number; authorName?: string }) {
  const router = useRouter()
  const [authors, setAuthors] = useState<AuthorOption[] | null>(null)
  const [choice, setChoice] = useState(authorId ? String(authorId) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    setError(null)
    try {
      const response = await fetch(`/api/admin-authors?collection=${collection}`, { credentials: 'same-origin' })
      if (!response.ok) throw new Error('forbidden')
      setAuthors(((await response.json()) as { authors: AuthorOption[] }).authors)
    } catch {
      setError('The list of authors could not be loaded.')
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch('/api/admin-authors', {
        body: JSON.stringify({ collection, id, author: Number(choice) }),
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = (await response.json().catch((): null => null)) as { error?: string } | null
      if (!response.ok) {
        setError(body?.error ?? 'Could not change the author.')
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Could not change the author. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className="doc-line">{authorName ? `Author: ${authorName}` : 'Author not recorded'}</p>
      {authors === null ? (
        <button className="doc-link" onClick={load} type="button">
          Change author
        </button>
      ) : (
        <div className="es-field-row">
          <label>
            <span className="es-sr">New author</span>
            <select disabled={busy} onChange={(event) => setChoice(event.target.value)} value={choice}>
              <option value="">Choose the new author</option>
              {authors.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" disabled={busy || choice === '' || choice === String(authorId ?? '')} onClick={save} type="button">
            {busy ? 'Saving...' : 'Save author'}
          </button>
        </div>
      )}
      {saved && <p className="doc-muted">Author changed.</p>}
      {error && <p className="doc-error">{error}</p>}
    </div>
  )
}
