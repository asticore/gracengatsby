'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import type { LibrarySummary } from '../types'

/** Where the author guide and the example library live. */
export const TEMPLATE_LIBRARY_GUIDE_URL = 'https://github.com/asticore/gracengatsby/blob/main/docs/template-libraries.md'

type Listing = { ok?: boolean; error?: string; libraries?: LibrarySummary[]; canManage?: boolean }

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Settings > Template libraries: add a library by its GitHub address, switch it on or off, remove it, refresh. */
export const TemplateLibrariesManager: React.FC = () => {
  const t = useAdminT()
  const [listing, setListing] = useState<Listing | null>(null)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const fetchListing = useCallback(
    async (fresh: boolean): Promise<Listing> => {
      try {
        const res = await fetch(`/api/template-libraries${fresh ? '?fresh=1' : ''}`, { credentials: 'include' })
        const json = (await res.json().catch((): null => null)) as Listing | null
        if (!res.ok || !json || json.ok === false) return { ok: false, libraries: [], error: json?.error || t('templateLibraries.loadFailed') }
        return json
      } catch {
        return { ok: false, libraries: [], error: t('templateLibraries.loadFailed') }
      }
    },
    [t],
  )

  const load = useCallback(async (fresh: boolean) => {
    setListing(await fetchListing(fresh))
  }, [fetchListing])

  useEffect(() => {
    let cancelled = false
    fetchListing(false).then((result) => {
      if (!cancelled) setListing(result)
    })
    return () => {
      cancelled = true
    }
  }, [fetchListing])

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key)
    setNote(null)
    try {
      const res = await fetch('/api/template-libraries/settings', { method: 'POST', headers: JSON_HEADERS, credentials: 'include', body: JSON.stringify(body) })
      const json = (await res.json().catch((): null => null)) as { ok?: boolean; error?: string; message?: string } | null
      if (!res.ok || !json || json.ok === false) {
        setNote(json?.error || t('templateLibraries.actionFailed'))
        return false
      }
      setNote(json.message || null)
      await load(true)
      return true
    } catch {
      setNote(t('templateLibraries.actionFailed'))
      return false
    } finally {
      setBusy(null)
    }
  }

  const add = async (event: React.FormEvent) => {
    event.preventDefault()
    if (await post({ action: 'add', url, label }, 'add')) {
      setUrl('')
      setLabel('')
    }
  }

  const libraries = listing?.libraries ?? []
  const canManage = listing?.canManage === true

  return (
    <div className="list-view" style={{ maxWidth: 960 }}>
      <p style={{ margin: '0 0 16px' }}>
        {t('templateLibraries.intro')} <a href={TEMPLATE_LIBRARY_GUIDE_URL} target="_blank" rel="noopener noreferrer">{t('templateLibraries.guideLink')}</a>
      </p>

      {canManage ? (
        <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', margin: '0 0 16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '2 1 320px' }}>
            <span>{t('templateLibraries.addLabel')}</span>
            <input
              type="url"
              required
              value={url}
              placeholder="https://github.com/owner/repo"
              onChange={(event) => setUrl(event.target.value)}
              style={{ padding: '6px 8px' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 160px' }}>
            <span>{t('templateLibraries.nameLabel')}</span>
            <input type="text" maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} style={{ padding: '6px 8px' }} />
          </label>
          <button type="submit" className="btn" disabled={busy !== null || url.trim() === ''}>
            {busy === 'add' ? t('templateLibraries.adding') : t('templateLibraries.add')}
          </button>
          <button type="button" className="btn btn--style-secondary" disabled={busy !== null} onClick={() => void load(true)}>
            {busy === 'refresh' ? t('templateLibraries.refreshing') : t('templateLibraries.refresh')}
          </button>
        </form>
      ) : null}

      {note ? (
        <p role="status" style={{ margin: '0 0 12px' }}>
          {note}
        </p>
      ) : null}
      {listing && listing.ok === false && listing.error ? <p role="alert">{listing.error}</p> : null}

      {libraries.length === 0 ? (
        <p className="list-empty">{t('templateLibraries.empty')}</p>
      ) : (
        <table className="list-table" aria-label={t('templateLibraries.title')}>
          <thead>
            <tr>
              <th>{t('templateLibraries.columnLibrary')}</th>
              <th>{t('templateLibraries.columnStatus')}</th>
              <th>{t('templateLibraries.columnOn')}</th>
              {canManage ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {libraries.map((library) => (
              <tr key={library.id}>
                <td>
                  <strong>{library.label}</strong>
                  <div style={{ fontSize: 12, opacity: 0.8, wordBreak: 'break-all' }}>{library.url}</div>
                </td>
                <td>
                  {library.error ? (
                    <span role="alert">{library.error}</span>
                  ) : library.enabled ? (
                    <span>
                      {library.name ? `${library.name}, ` : ''}
                      {t('templateLibraries.itemCount', { count: library.itemCount })}
                    </span>
                  ) : (
                    <span>-</span>
                  )}
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('templateLibraries.toggleLabel')}
                    checked={library.enabled}
                    disabled={!canManage || busy !== null}
                    onChange={(event) => void post({ action: 'toggle', id: library.id, enabled: event.target.checked }, `toggle:${library.id}`)}
                  />
                </td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      className="btn btn--style-secondary btn--size-small"
                      disabled={busy !== null}
                      onClick={() => {
                        if (window.confirm(t('templateLibraries.removeConfirm'))) void post({ action: 'remove', id: library.id }, `remove:${library.id}`)
                      }}
                    >
                      {t('templateLibraries.remove')}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default TemplateLibrariesManager
