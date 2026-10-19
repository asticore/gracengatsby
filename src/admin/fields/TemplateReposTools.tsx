'use client'

import React, { useState } from 'react'

type Line = { label: string; ok: boolean; message: string }

/** Buttons under the repository list: reload the template lists past the cache, and check the saved token. Never shows the token. */
export const TemplateReposTools: React.FC = () => {
  const [busy, setBusy] = useState<'refresh' | 'token' | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState<string | null>(null)

  const refresh = async () => {
    setBusy('refresh')
    setNote(null)
    try {
      const res = await fetch('/api/template-repos?fresh=1', { credentials: 'include' })
      const json = (await res.json().catch((): null => null)) as { ok?: boolean; error?: string; templates?: unknown[]; errors?: Array<{ repoLabel: string; error: string }> } | null
      if (!res.ok || !json || json.ok === false) {
        setLines([])
        setNote(json?.error || 'The templates could not be reloaded.')
        return
      }
      setLines((json.errors ?? []).map((e) => ({ label: e.repoLabel, ok: false, message: e.error })))
      setNote(`Reloaded. ${json.templates?.length ?? 0} templates found.`)
    } catch {
      setNote('The templates could not be reloaded.')
    } finally {
      setBusy(null)
    }
  }

  const testToken = async () => {
    setBusy('token')
    setNote(null)
    try {
      const res = await fetch('/api/template-repos/test-token', { method: 'POST', credentials: 'include' })
      const json = (await res.json().catch((): null => null)) as {
        ok?: boolean
        error?: string
        hasToken?: boolean
        results?: Array<{ repoLabel: string; ok: boolean; message: string }>
      } | null
      if (!res.ok || !json || json.ok === false) {
        setLines([])
        setNote(json?.error || 'The check could not be run.')
        return
      }
      setLines((json.results ?? []).map((r) => ({ label: r.repoLabel, ok: r.ok, message: r.message })))
      setNote(json.hasToken ? 'Checked with the saved token.' : 'No token is saved, so this checked public access.')
    } catch {
      setNote('The check could not be run.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ margin: '0 0 16px', fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--style-secondary btn--size-small" disabled={busy !== null} onClick={refresh}>
          {busy === 'refresh' ? 'Reloading...' : 'Refresh templates'}
        </button>
        <button type="button" className="btn btn--style-secondary btn--size-small" disabled={busy !== null} onClick={testToken}>
          {busy === 'token' ? 'Checking...' : 'Test token'}
        </button>
      </div>
      <p style={{ margin: '6px 0 0' }} role="status">
        Save your changes first: both buttons use the saved settings. {note}
      </p>
      {lines.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {lines.map((line) => (
            <li key={`${line.label}-${line.message}`}>
              <strong>{line.label}</strong>: {line.ok ? 'OK. ' : 'Problem. '}
              {line.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TemplateReposTools
