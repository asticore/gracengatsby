'use client'

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
  /** Whether a preview link can be generated for this document. */
  canPreview: boolean
}

const BOX_STATE_KEY = 'ac-doc-panel-boxes'

function readBoxState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(BOX_STATE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeBoxState(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(BOX_STATE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be blocked; boxes just open by default next time.
  }
}

const Box: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => {
  const [open, setOpen] = useState(true)
  useEffect(() => {
    // localStorage is only readable after mount (reading it during render would not match the server HTML).
    const stored = readBoxState()[id]
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== undefined) setOpen(stored)
  }, [id])
  return (
    <details
      className="doc-box"
      open={open}
      onToggle={(event) => {
        const next = (event.currentTarget as HTMLDetailsElement).open
        setOpen(next)
        writeBoxState({ ...readBoxState(), [id]: next })
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
        {loading ? 'Generating…' : 'Preview'}
      </button>
      {hasUnsavedChanges && <p className="doc-muted">Preview shows the last saved version.</p>}
      {error && <p className="doc-error">{error}</p>}
    </>
  )
}

const RevisionsBox: React.FC<{ collectionSlug: string; id: number; updatedAt?: string }> = ({ collectionSlug, id, updatedAt }) => {
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
    <Box id="revisions" title="Revisions">
      {state === 'loading' && <p className="doc-muted">Loading…</p>}
      {state === 'unavailable' && <p className="doc-muted">Version history is not available.</p>}
      {typeof state === 'object' && (
        <>
          <p className="doc-line">
            <strong>{state.total}</strong> {state.total === 1 ? 'version' : 'versions'}
          </p>
          {state.latest && <p className="doc-muted">Last saved {formatDate(state.latest)} by {resolveName_(state.updatedBy)}</p>}
          <Link className="doc-link" href={`/admin/collections/${collectionSlug}/${id}/versions`}>
            View past drafts
          </Link>
        </>
      )}
    </Box>
  )
}

const DetailsBox: React.FC<{ info: DocumentPanelInfo }> = ({ info }) => {
  const [copied, setCopied] = useState(false)
  const apiPath = info.id ? `/api/${info.collectionSlug}/${info.id}` : undefined
  return (
    <Box id="details" title="Details">
      <dl className="doc-details">
        <dt>ID</dt>
        <dd>{info.id ?? '-'}</dd>
        {info.trackAuthorship && (
          <>
            <dt>Last edited by</dt>
            <dd>{info.updatedByName || 'Unknown'} on {formatDate(info.updatedAt)}</dd>
            <dt>Created by</dt>
            <dd>{info.createdByName || 'Unknown'}</dd>
          </>
        )}
        <dt>Last modified</dt>
        <dd>{formatDate(info.updatedAt)}</dd>
        <dt>Created</dt>
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
  const modified = useFormModified()
  const { busy, duplicate, error, remove, save, savedAt } = useDocumentSave({
    collectionSlug: info.collectionSlug,
    draftsEnabled: info.draftsEnabled,
    id: info.id,
  })
  const isNew = info.id === undefined
  const isPublished = info.status === 'published'
  const [lockedByOther, setLockedByOther] = useState(false)
  const anyBusy = busy !== null || lockedByOther

  const badge = isNew ? 'New' : info.draftsEnabled ? (isPublished ? 'Published' : 'Draft') : 'Saved'

  return (
    <div className="doc-panel">
      <EditLockBanner collectionSlug={info.collectionSlug} id={info.id} onLockedByOther={setLockedByOther} />
      <div className="doc-panel__head">
        <div className="doc-status">
          <span className={isPublished ? 'pill pill--accent' : 'pill'}>{badge}</span>
          {modified && <span className="doc-unsaved">Unsaved changes</span>}
          {!modified && savedAt && <span className="doc-saved">Saved</span>}
        </div>

        {info.visualEditorHref ? (
          <a className="btn btn--primary doc-ve-button" href={info.visualEditorHref}>
            Edit in visual editor
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

      {!readOnly && (
        <Box id="publish" title={info.draftsEnabled ? 'Publish' : 'Save'}>
          <VisibilityPanel collectionSlug={info.collectionSlug} id={info.id} readOnly={readOnly} />
          {info.draftsEnabled && (
            <SchedulePanel collectionSlug={info.collectionSlug} id={info.id} readOnly={readOnly} status={info.status} />
          )}
          <div className="doc-buttons">
            {info.draftsEnabled && (
              <button className="btn" disabled={anyBusy} onClick={() => save('draft')} type="button">
                {busy === 'draft' ? 'Saving…' : 'Save draft'}
              </button>
            )}
            <button className="btn btn--primary" disabled={anyBusy} onClick={() => save('published')} type="button">
              {busy === 'published' ? 'Saving…' : info.draftsEnabled ? (isPublished ? 'Update' : 'Publish') : 'Save'}
            </button>
          </div>
          {info.draftsEnabled && isPublished && !isNew && (
            <ConfirmButton
              busy={busy === 'unpublish'}
              confirmLabel="Yes, switch to draft"
              disabled={anyBusy}
              label="Switch to draft"
              onConfirm={() => save('unpublish')}
            />
          )}
          {error && <p className="doc-error">{error}</p>}
          {!isNew && (
            <div className="doc-secondary">
              {info.canCreate && (
                <button className="doc-link" disabled={anyBusy} onClick={duplicate} type="button">
                  {busy === 'duplicate' ? 'Duplicating…' : 'Duplicate'}
                </button>
              )}
              {info.canDelete && (
                <ConfirmButton
                  busy={busy === 'delete'}
                  confirmLabel={busy === 'delete' ? 'Deleting…' : `Yes, delete this ${info.label.toLowerCase()}`}
                  danger
                  disabled={anyBusy}
                  label="Delete"
                  onConfirm={remove}
                />
              )}
            </div>
          )}
        </Box>
      )}

      {info.draftsEnabled && !isNew && info.id !== undefined && (
        <RevisionsBox collectionSlug={info.collectionSlug} id={info.id} updatedAt={info.updatedAt} />
      )}

      {pageTypeField && (
        <Box id="pagetype" title="Page type">
          <FieldRenderer fields={[pageTypeField]} readOnly={readOnly} />
          <p className="doc-muted">Used for search engine structured data.</p>
        </Box>
      )}

      {!isNew && <DetailsBox info={info} />}
    </div>
  )
}

export default DocumentPanel
