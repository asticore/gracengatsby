'use client'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import React, { useEffect, useState } from 'react'

/** The logo as the brand stores it: the media id, and an absolute address for the preview. */
export type LogoChoice = { id: number; url: string }

type MediaItem = { id: number; url?: string | null; filename?: string | null; alt?: string | null; mimeType?: string | null }

type Props = { logo: LogoChoice | null; onChange: (logo: LogoChoice | null) => void }

const isPicture = (item: MediaItem): boolean => typeof item.url === 'string' && item.url !== '' && (!item.mimeType || item.mimeType.startsWith('image/'))

/** Turns a media address into one that works inside the preview frame. Runs on click only, never while rendering. */
const absoluteAddress = (url: string): string => (/^https?:\/\//i.test(url) ? url : new URL(url, window.location.origin).href)

/** Shows the chosen logo and lets the admin pick another from the Media library. */
export function LogoPicker({ logo, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || items !== null) return
    let cancelled = false
    fetch('/api/media?limit=60&sort=-createdAt&depth=0', { credentials: 'include', cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json()
      })
      .then((data: { docs?: MediaItem[] }) => {
        if (!cancelled) setItems((data.docs ?? []).filter(isPicture))
      })
      .catch(() => {
        if (!cancelled) setError('The Media library could not be loaded. Try again in a moment.')
      })
    return () => {
      cancelled = true
    }
  }, [open, items])

  const choose = (item: MediaItem) => {
    if (typeof item.url !== 'string') return
    onChange({ id: item.id, url: absoluteAddress(item.url) })
    setOpen(false)
  }

  return (
    <div className="ed-logo">
      <span className="ed-field__label">Logo</span>
      {logo ? (
        <div className="ed-logo__current">
          {logo.url ? <img className="ed-logo__preview" src={logo.url} alt="Current logo" /> : <span className="ed-muted">Logo chosen (media item {logo.id})</span>}
        </div>
      ) : (
        <p className="ed-muted">No logo. Designed emails show no logo until you choose one.</p>
      )}
      <div className="ed-actions">
        <button type="button" className="ed-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          {logo ? 'Change logo' : 'Choose a logo'}
        </button>
        {logo && (
          <button type="button" className="ed-button ed-button--quiet" onClick={() => onChange(null)}>
            Remove logo
          </button>
        )}
      </div>
      {open && (
        <div className="ed-logo__library" role="group" aria-label="Pictures in the Media library">
          {error && <p className="ed-notice ed-notice--error">{error}</p>}
          {!error && items === null && <p className="ed-muted">Loading pictures...</p>}
          {items !== null && items.length === 0 && (
            <p className="ed-muted">
              No pictures yet. Upload the logo in <AdminLink path="/content/media">Media</AdminLink>, then come back here.
            </p>
          )}
          <div className="ed-logo__grid">
            {(items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                className="ed-logo__choice"
                aria-pressed={logo?.id === item.id}
                onClick={() => choose(item)}
              >
                {typeof item.url === 'string' && <img src={item.url} alt={item.alt || item.filename || 'Picture'} />}
                <span className="ed-muted">{item.filename || `Picture ${item.id}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
