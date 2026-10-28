'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { formatLimit, loadUploadRules, runPool, UPLOAD_CONCURRENCY, uploadFile, type UploadRules } from '@/features/media/admin/uploadClient'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { filenameToAlt, filesFromClipboard, validateFiles } from './mediaPickerUpload'

type MediaDoc = {
  id: number
  url?: string | null
  alt?: string | null
  filename?: string | null
}

export const MediaPicker: React.FC<{
  onSelect: (id: number, doc: MediaDoc) => void
  /** Multi-select callers: receives every uploaded doc in one call so the list can be appended once. */
  onSelectMany?: (docs: MediaDoc[]) => void
  onClose: () => void
}> = ({ onSelect, onSelectMany, onClose }) => {
  const t = useAdminT()
  const [rules, setRules] = useState<UploadRules | null>(null)
  const [status, setStatus] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [altText, setAltText] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    loadUploadRules().then((r) => {
      if (live) setRules(r)
    })
    return () => {
      live = false
    }
  }, [])

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || uploading) return
      const check = validateFiles(files, rules, !onSelectMany)
      const problems = check.rejected.map((r) => `${r.name}: ${r.error}`)
      setErrors(problems)
      if (check.accepted.length === 0) {
        setStatus(t('ve.media.noFiles'))
        return
      }
      setUploading(true)
      setStatus(`Uploading ${check.accepted.length} file${check.accepted.length === 1 ? '' : 's'}...`)
      const done: MediaDoc[] = []
      const failed = [...problems]
      await runPool(check.accepted, UPLOAD_CONCURRENCY, async (file) => {
        const outcome = await uploadFile(file, {
          alt: altText.trim() || filenameToAlt(file.name),
          onProgress: (f) => setProgress((p) => ({ ...p, [file.name]: f })),
        })
        if (outcome.ok === true) done.push({ id: Number(outcome.doc.id), url: outcome.doc.url, alt: outcome.doc.alt, filename: outcome.doc.filename })
        else failed.push(`${file.name}: ${(outcome as { error: string }).error}`)
      })
      setUploading(false)
      setProgress({})
      setErrors(failed)
      if (done.length === 0) {
        setStatus(t('ve.media.uploadFailed'))
        return
      }
      setStatus(`Uploaded ${done.length} file${done.length === 1 ? '' : 's'}.`)
      if (onSelectMany) onSelectMany(done)
      else onSelect(done[0].id, done[0])
    },
    [uploading, rules, onSelect, onSelectMany, altText],
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = filesFromClipboard(event.clipboardData?.items)
      if (files.length > 0) {
        event.preventDefault()
        void upload(files)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [upload])

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
          <h3>{t('ve.media.title')}</h3>
          <button type="button" className="ve-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ve-modal__body">
          <div
            className="ve-media-drop"
            data-dragging={dragging ? 'true' : undefined}
            style={{ border: '2px dashed currentColor', borderRadius: 8, padding: 12, marginBottom: 12, opacity: dragging ? 1 : 0.85 }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void upload(Array.from(e.dataTransfer.files))
            }}
          >
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple={Boolean(onSelectMany)}
              accept={rules ? rules.accept.join(',') : 'image/*'}
              data-testid="ve-media-file-input"
              onChange={(e) => {
                void upload(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <button type="button" className="ve-btn" disabled={uploading} onClick={() => fileInput.current?.click()}>
              Upload
            </button>{' '}
            <span>
              or drop {onSelectMany ? 'images' : 'an image'} here, or paste from the clipboard
              {rules ? ` (up to ${formatLimit(rules.maxBytes)} each)` : ''}.
            </span>
            <label style={{ display: 'block', marginTop: 8 }}>
              Alt text (optional, defaults to the file name)
              <input type="text" value={altText} maxLength={300} onChange={(e) => setAltText(e.target.value)} style={{ display: 'block', width: '100%' }} />
            </label>
            {Object.entries(progress).map(([name, f]) => (
              <progress key={name} value={f} max={1} aria-label={`Uploading ${name}`} style={{ display: 'block', width: '100%' }} />
            ))}
            <p role="status" aria-live="polite" style={{ margin: '8px 0 0' }}>
              {status}
            </p>
            {errors.length > 0 && (
              <ul role="alert" className="ve-error">
                {errors.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
          {loading && <p>{t('ve.media.loading')}</p>}
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
                  <span>{t('ve.media.noPreview')}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
