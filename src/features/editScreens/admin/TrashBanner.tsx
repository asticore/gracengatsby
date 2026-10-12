'use client'

import React, { useState } from 'react'

import { useDocumentSave } from '@/admin/views/useDocumentSave'
import './edit-screens.css'

/**
 * Shown at the top of the edit screen of a document that is in the trash:
 * says so, and offers Restore and Delete permanently (the latter with a
 * confirmation). Both need the Delete permission; the server refuses without it.
 */
export function TrashBanner({ collectionSlug, id, label, trashedAt, canDelete }: { collectionSlug: string; id: number; label: string; trashedAt?: string; canDelete: boolean }) {
  const { busy, error, remove, setTrashed } = useDocumentSave({ collectionSlug, id })
  const [asking, setAsking] = useState(false)
  const when = trashedAt && !Number.isNaN(new Date(trashedAt).getTime()) ? new Date(trashedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''

  return (
    <div className="es-banner es-banner--trash" role="status">
      <p>
        This {label.toLowerCase()} is in the trash{when ? ` (moved ${when})` : ''}. It is a draft and is not on the public site.
      </p>
      {canDelete && (
        <>
          <button className="btn" disabled={busy !== null} onClick={() => setTrashed('restore')} type="button">
            {busy === 'restore' ? 'Restoring...' : 'Restore'}
          </button>
          {!asking ? (
            <button className="btn" disabled={busy !== null} onClick={() => setAsking(true)} type="button">
              Delete permanently
            </button>
          ) : (
            <span>
              <button className="btn btn--primary" disabled={busy !== null} onClick={remove} type="button">
                {busy === 'delete' ? 'Deleting...' : 'Yes, delete for good'}
              </button>{' '}
              <button className="btn" onClick={() => setAsking(false)} type="button">
                Cancel
              </button>
            </span>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
