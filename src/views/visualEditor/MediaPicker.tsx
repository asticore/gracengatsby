'use client'

import React, { useEffect, useState } from 'react'

type MediaDoc = {
  id: number
  url?: string | null
  alt?: string | null
  filename?: string | null
}

export const MediaPicker: React.FC<{
  onSelect: (id: number, doc: MediaDoc) => void
  onClose: () => void
}> = ({ onSelect, onClose }) => {
  const [items, setItems] = useState<MediaDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/media?limit=100&sort=-createdAt&depth=0', { credentials: 'include' })
      .then((res) => res.json())
      .then((data: { docs?: MediaDoc[] }) => {
        if (cancelled) return
        setItems(data?.docs || [])
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(String(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="ve-modal-overlay" onClick={onClose}>
      <div className="ve-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ve-modal__header">
          <h3>Choose an image</h3>
          <button type="button" className="ve-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ve-modal__body">
          {loading && <p>Loading media library…</p>}
          {error && <p className="ve-error">Couldn&apos;t load media: {error}</p>}
          {!loading && !error && items.length === 0 && (
            <p>
              No media uploaded yet. Add images from the regular admin&apos;s Media collection, then come back here to
              use them.
            </p>
          )}
          <div className="ve-media-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ve-media-grid__item"
                onClick={() => onSelect(item.id, item)}
                title={item.filename || ''}
              >
                {item.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.alt || ''} />
                ) : (
                  <span>No preview</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
