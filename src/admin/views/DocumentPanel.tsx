'use client'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { adminCollectionPath } from '@/admin/adminPaths'

/**
 * Right-hand overview panel on a collection document's edit screen, in the
 * style of the WordPress publish box: status and the visual editor button on
 * top, then Publish, Revisions, Settings (the document's `position: 'sidebar'`
 * fields) and Details boxes.
 *
 * Lives inside the form's own provider because the Save/Publish buttons read
 * the live form state, and the Settings box renders real fields from it.
 */

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { Field } from '@/engine'
import { useFormModified } from '@/admin/context'
import { FieldRenderer } from '@/admin/fields/FieldRenderer'
import { resolveName } from './authorName'
import { useAuthorNames } from './useAuthorNames'
import { useDocumentSave } from './useDocumentSave'
import { VisibilityPanel } from './VisibilityPanel'
import { SchedulePanel } from './SchedulePanel'
import { EditLockBanner } from './EditLockBanner'
import { setCardOpen, useCardOpen } from '@/admin/components/collapseStore'
import { ReviewActions, ReviewBox, ReviewStatusPill, publishHidden } from '@/features/approval/ui/ReviewPanel'
import { useReviewState } from '@/features/approval/ui/useReviewState'
import { AuthorBox } from '@/features/editScreens/admin/AuthorBox'

export type DocumentPanelInfo = {
  collectionSlug: string
  id?: number
  label: string
  draftsEnabled: boolean
  /** `draft` | `published` for drafts collections, undefined otherwise. */
  status?: string
  createdAt?: string
  updatedAt?: string
  /** Display name for who last edited the document. */
  updatedByName?: string
  /** Display name for who created the document. */
  createdByName?: string
  /** Whether this collection tracks authorship (has createdBy/updatedBy fields). */
  trackAuthorship?: boolean
  /** Visual editor entry for this document, when the collection has one. */
  visualEditorHref?: string
  /** Public URL of the document, when it has one. */
  liveHref?: string
  canDelete: boolean
  canCreate: boolean
  canUpdate: boolean
  /** Whether a preview link can be generated for this document. */
  canPreview: boolean
  /** Pages, posts and events: Delete becomes "Move to trash". */
  trashEnabled?: boolean
  /** ISO time the document was trashed, when it is in the trash. */
  trashedAt?: string
  /** Whether the user may change who the author is (administrator, or can edit other people's work). */
  canChangeAuthor?: boolean
  /** The current author's user id (createdBy), for the Author box. */
  authorId?: number
  /** Whether the user holds "Edit SEO settings". Without it the SEO card is read-only. */
  canEditSeo?: boolean
}

/**
 * A collapsible box in the side panel. Open state is remembered per user via
 * the shared edit-screen store (ids are namespaced `panel:<id>`).
 */
const Box: React.FC<{ id: string; title: string; children: React.ReactNode; alwaysOpen?: boolean }> = ({
  id,
  title,
  children,
  alwaysOpen,
}) => {
  const storeId = `panel:${id}`
  const [open] = useCardOpen(storeId)
  // The Save / Publish box holds the only save button, so it is never collapsed.
  if (alwaysOpen) {
    return (
      <details className="doc-box" open onToggle={(event) => ((event.currentTarget as HTMLDetailsElement).open = true)}>
        <summary className="doc-box__title">{title}</summary>
        <div className="doc-box__body">{children}</div>
      </details>
    )
  }
  return (
    <details
      className="doc-box"
      open={open}
      onToggle={(event) => {
        // Fires for user clicks and for our own `open` prop changes; setCardOpen ignores no-ops.
        setCardOpen(storeId, (event.currentTarget as HTMLDetailsElement).open)
      }}
    >
      <summary className="doc-box__title">{title}</summary>
      <div className="doc-box__body">{children}</div>
    </details>
  )
}

function formatDate(value?: string): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

const ConfirmButton: React.FC<{
  label: string
  confirmLabel: string
  busy: boolean
  disabled: boolean
  danger?: boolean
  onConfirm: () => void
}> = ({ label, confirmLabel, busy, disabled, danger, onConfirm }) => {
  const [asking, setAsking] = useState(false)
  if (asking) {
    return (
      <span className="doc-confirm">
        <button className={danger ? 'doc-link doc-link--danger' : 'doc-link'} disabled={busy} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
        <button className="doc-link" onClick={() => setAsking(false)} type="button">
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button className={danger ? 'doc-link doc-link--danger' : 'doc-link'} disabled={disabled} onClick={() => setAsking(true)} type="button">
      {label}
    </button>
  )
}

const PreviewButton: React.FC<{
  collectionSlug: string
  id: number
  hasUnsavedChanges: boolean
}> = ({ collectionSlug, id, hasUnsavedChanges }) => {
  const t = useAdminT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/preview-link?collection=${collectionSlug}&id=${id}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const body = (await response.json()) as { error?: string }
        throw new Error(body.error || 'Failed to generate preview link')
      }
      const data = (await response.json()) as { url?: string }
      if (data.url) {
        window.open(data.url, '_blank', 'noopener')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview link')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button className="btn btn--secondary" disabled={loading} onClick={handlePreview} type="button">
        {loading ? 'Generating…' : t('edit.preview')}
      </button>
      {hasUnsavedChanges && <p className="doc-muted">{t('edit.previewLastSaved')}</p>}
      {error && <p className="doc-error">{error}</p>}
    </>
  )
}

const RevisionsBox: React.FC<{ collectionSlug: string; id: number; updatedAt?: string }> = ({ collectionSlug, id, updatedAt }) => {
  const t = useAdminT()
  const [state, setState] = useState<{ total: number; latest?: string; updatedBy?: unknown } | 'loading' | 'unavailable'>('loading')
  const resolveName_ = useAuthorNames(state !== 'loading' && typeof state === 'object' ? [state.updatedBy] : [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${collectionSlug}/versions?where[parent][equals]=${id}&limit=1&sort=-updatedAt&depth=0`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('versions unavailable')
        const body = (await response.json()) as { docs?: Array<{ updatedAt?: string; updatedBy?: unknown; version?: { updatedBy?: unknown } }>; totalDocs?: number }
        if (!cancelled) setState({ latest: body.docs?.[0]?.updatedAt, updatedBy: body.docs?.[0]?.version?.updatedBy ?? body.docs?.[0]?.updatedBy, total: body.totalDocs ?? body.docs?.length ?? 0 })
      })
      .catch(() => {
        if (!cancelled) setState('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [collectionSlug, id, updatedAt])

  return (
    <Box id="revisions" title={t('edit.revisions')}>
      {state === 'loading' && <p className="doc-muted">Loading…</p>}
      {state === 'unavailable' && <p className="doc-muted">Version history is not available.</p>}
      {typeof state === 'object' && (
        <>
          <p className="doc-line">
            <strong>{state.total}</strong> {state.total === 1 ? 'version' : 'versions'}
          </p>
          {state.latest && <p className="doc-muted">Last saved {formatDate(state.latest)} by {resolveName_(state.updatedBy)}</p>}
          <Link className="doc-link" href={`${adminCollectionPath(collectionSlug)}/${id}/versions`}>
            View past drafts
          </Link>
        </>
      )}
    </Box>
  )
}

const DetailsBox: React.FC<{ info: DocumentPanelInfo }> = ({ info }) => {
  const t = useAdminT()
  const [copied, setCopied] = useState(false)
  const apiPath = info.id ? `/api/${info.collectionSlug}/${info.id}` : undefined
  return (
    <Box id="details" title={t('edit.details')}>
      <dl className="doc-details">
        <dt>ID</dt>
        <dd>{info.id ?? '-'}</dd>
        {info.trackAuthorship && (
          <>
            <dt>{t('edit.lastEditedBy')}</dt>
            <dd>{t('edit.editedOn', { name: info.updatedByName || t('edit.unknown'), date: formatDate(info.updatedAt) })}</dd>
            <dt>{t('edit.createdBy')}</dt>
            <dd>{info.createdByName || t('edit.unknown')}</dd>
          </>
        )}
        <dt>{t('edit.lastModified')}</dt>
        <dd>{formatDate(info.updatedAt)}</dd>
        <dt>{t('edit.created')}</dt>
        <dd>{formatDate(info.createdAt)}</dd>
        {apiPath && (
          <>
            <dt>API URL</dt>
            <dd>
              <code>{apiPath}</code>{' '}
              <button
                className="doc-link"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(`${window.location.origin}${apiPath}`)
                    .then(() => {
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 1500)
                    })
                    .catch((): void => undefined)
                }}
                type="button"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </dd>
          </>
        )}
      </dl>
    </Box>
  )
}


export const DocumentPanel: React.FC<{
  info: DocumentPanelInfo
  readOnly?: boolean
  pageTypeField?: Field
}> = ({ info, readOnly, pageTypeField }) => {
  const t = useAdminT()
  const modified = useFormModified()
  const { busy, duplicate, error, remove, save, savedAt, setTrashed } = useDocumentSave({
    collectionSlug: info.collectionSlug,
    draftsEnabled: info.draftsEnabled,
    id: info.id,
  })
  const isNew = info.id === undefined
  const isPublished = info.status === 'published'
  const [lockedByOther, setLockedByOther] = useState(false)
  const anyBusy = busy !== null || lockedByOther
  // Review state is read from the approval route, so it is re-read after every save.
  const review = useReviewState(info.collectionSlug, info.id, savedAt)
  const hidePublish = !isNew && publishHidden(review.state)

  const badge = isNew ? t('status.new') : info.draftsEnabled ? (isPublished ? t('status.published') : t('status.draft')) : t('status.saved')

  return (
    <div className="doc-panel">
      <EditLockBanner collectionSlug={info.collectionSlug} id={info.id} onLockedByOther={setLockedByOther} />
      <div className="doc-panel__head">
        <div className="doc-status">
          <span className={isPublished ? 'pill pill--accent' : 'pill'}>{badge}</span>
          <ReviewStatusPill state={review.state} />
          {modified && <span className="doc-unsaved">{t('edit.unsavedChanges')}</span>}
          {!modified && savedAt && <span className="doc-saved">{t('status.saved')}</span>}
        </div>

        {info.visualEditorHref ? (
          <a className="btn btn--primary doc-ve-button" href={info.visualEditorHref}>
            {t('editor.editInVisual')}
          </a>
        ) : null}

        {(info.liveHref || info.visualEditorHref || info.canPreview) && !isNew && (
          <div className="doc-links">
            {info.liveHref && (
              <a className="doc-link" href={info.liveHref} rel="noreferrer" target="_blank">
                View live
              </a>
            )}
            {info.canPreview && info.id !== undefined && (
              <PreviewButton collectionSlug={info.collectionSlug} hasUnsavedChanges={modified} id={info.id} />
            )}
          </div>
        )}
      </div>

      {!readOnly && info.canUpdate && (
        <Box alwaysOpen id="publish" title={info.draftsEnabled ? t('common.publish') : t('common.save')}>
          <VisibilityPanel collectionSlug={info.collectionSlug} id={info.id} readOnly={readOnly} />
          {info.draftsEnabled && (
            <SchedulePanel collectionSlug={info.collectionSlug} id={info.id} readOnly={readOnly} status={info.status} />
          )}
          {info.draftsEnabled && !isNew && (
            <ReviewActions
              busy={anyBusy}
              isPublished={isPublished}
              modified={modified}
              onSaveDraft={() => save('draft')}
              review={review}
            />
          )}
          <div className="doc-buttons">
            {info.draftsEnabled && (
              <button className="btn" disabled={anyBusy} onClick={() => save('draft')} type="button">
                {busy === 'draft' ? 'Saving…' : t('common.saveDraft')}
              </button>
            )}
            {!hidePublish && (
              <button className="btn btn--primary" disabled={anyBusy} onClick={() => save('published')} type="button">
                {busy === 'published' ? 'Saving…' : info.draftsEnabled ? (isPublished ? 'Update' : t('common.publish')) : t('common.save')}
              </button>
            )}
          </div>
          {info.draftsEnabled && isPublished && !isNew && (
            <ConfirmButton
              busy={busy === 'unpublish'}
              confirmLabel={t('edit.yesSwitchToDraft')}
              disabled={anyBusy}
              label={t('edit.switchToDraft')}
              onConfirm={() => save('unpublish')}
            />
          )}
          {error && <p className="doc-error">{error}</p>}
          {!isNew && (
            <div className="doc-secondary">
              {info.canCreate && (
                <button className="doc-link" disabled={anyBusy} onClick={duplicate} type="button">
                  {busy === 'duplicate' ? t('edit.duplicating') : t('common.duplicate')}
                </button>
              )}
              {info.canDelete && info.trashEnabled && !info.trashedAt && (
                <ConfirmButton
                  busy={busy === 'trash'}
                  confirmLabel={busy === 'trash' ? t('trash.moving') : t('trash.confirmMove', { thing: info.label.toLowerCase() })}
                  danger
                  disabled={anyBusy}
                  label={t('edit.moveToTrash')}
                  onConfirm={() => setTrashed('trash')}
                />
              )}
              {info.canDelete && !info.trashEnabled && (
                <ConfirmButton
                  busy={busy === 'delete'}
                  confirmLabel={busy === 'delete' ? t('edit.deleting') : t('edit.confirmDelete', { thing: info.label.toLowerCase() })}
                  danger
                  disabled={anyBusy}
                  label={t('common.delete')}
                  onConfirm={remove}
                />
              )}
            </div>
          )}
        </Box>
      )}

      {!isNew && review.state?.enabled && (
        <Box id="review" title={t('edit.review')}>
          <ReviewBox review={review} />
        </Box>
      )}

      {info.draftsEnabled && !isNew && info.id !== undefined && (
        <RevisionsBox collectionSlug={info.collectionSlug} id={info.id} updatedAt={info.updatedAt} />
      )}

      {!isNew && info.canChangeAuthor && info.id !== undefined && (
        <Box id="author" title={t('edit.author')}>
          <AuthorBox authorId={info.authorId} authorName={info.createdByName} collection={info.collectionSlug} id={info.id} />
        </Box>
      )}

      {pageTypeField && (
        <Box id="pagetype" title={t('edit.pageType')}>
          <FieldRenderer fields={[pageTypeField]} readOnly={readOnly} />
          <p className="doc-muted">Used for search engine structured data.</p>
        </Box>
      )}

      {!isNew && <DetailsBox info={info} />}
    </div>
  )
}

export default DocumentPanel