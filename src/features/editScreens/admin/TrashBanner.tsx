'use client'

import React, { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { useDocumentSave } from '@/admin/views/useDocumentSave'
import './edit-screens.css'

/**
 * Shown at the top of the edit screen of a document that is in the trash:
 * says so, and offers Restore and Delete permanently (the latter with a
 * confirmation). Both need the Delete permission; the server refuses without it.
 */
export function TrashBanner({ collectionSlug, id, label, trashedAt, canDelete }: { collectionSlug: string; id: number; label: string; trashedAt?: string; canDelete: boolean }) {
  const t = useAdminT()
  const { busy, error, remove, setTrashed } = useDocumentSave({ collectionSlug, id })
  const [asking, setAsking] = useState(false)
  const when = trashedAt && !Number.isNaN(new Date(trashedAt).getTime()) ? new Date(trashedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''

  return (
    <div className="es-banner es-banner--trash" role="status">
      <p>
        {when
          ? t('trash.bannerMoved', { label: label.toLowerCase(), when })
          : t('trash.bannerNoDate', { label: label.toLowerCase() })}
      </p>
      {canDelete && (
        <>
          <button className="btn" disabled={busy !== null} onClick={() => setTrashed('restore')} type="button">
            {busy === 'restore' ? 'Restoring...' : t('common.restore')}
          </button>
          {!asking ? (
            <button className="btn" disabled={busy !== null} onClick={() => setAsking(true)} type="button">
              {t('trash.deletePermanently')}
            </button>
          ) : (
            <span>
              <button className="btn btn--primary" disabled={busy !== null} onClick={remove} type="button">
                {busy === 'delete' ? 'Deleting...' : t('trash.deleteForGood')}
              </button>{' '}
              <button className="btn" onClick={() => setAsking(false)} type="button">
                {t('common.cancel')}
              </button>
            </span>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
