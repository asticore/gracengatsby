'use client'

import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildQuickEditPatch, getDescendantIds, type QuickEditData } from '@/admin/list/quickEdit'

interface ListRowActionsProps {
  collectionSlug: string
  doc: Record<string, unknown>
  hasDrafts: boolean
  canDuplicate: boolean
  canUpdate: boolean
}

interface PageOption {
  id: number | string
  title: string
}

export function ListRowActions({
  collectionSlug,
  doc,
  hasDrafts,
  canDuplicate,
  canUpdate,
}: ListRowActionsProps) {
  const router = useRouter()
  const [showQuickEdit, setShowQuickEdit] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; url?: string } | null>(null)
  const [pages, setPages] = useState<PageOption[]>([])
  const [editData, setEditData] = useState<QuickEditData>({
    title: String(doc.title || ''),
    slug: String(doc.slug || ''),
    _status: hasDrafts ? ((doc._status as 'draft' | 'published') || 'published') : undefined,
    parent: collectionSlug === 'pages' ? (doc.parent as number | string | null) : undefined,
  })
  const modalRef = useRef<HTMLDivElement>(null)

  const fetchPages = useCallback(async () => {
    try {
      const response = await fetch('/api/pages?limit=1000&depth=0')
      if (!response.ok) throw new Error('Failed to fetch pages')
      const data = (await response.json()) as unknown
      const pagesList = Array.isArray(data) ? data : (data as { docs?: unknown[] }).docs || []
      setPages(pagesList as PageOption[])
    } catch {
      console.error('Error fetching pages')
    }
  }, [])

  // Fetch pages for parent picker
  useEffect(() => {
    if (collectionSlug === 'pages' && showQuickEdit) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPages()
    }
  }, [collectionSlug, showQuickEdit, fetchPages])

  // Close modal on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowQuickEdit(false)
      }
    }
    if (showQuickEdit) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showQuickEdit])

  // Clear toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const handleDuplicate = async () => {
    setIsDuplicating(true)
    setError(null)
    try {
      const response = await fetch(`/api/${collectionSlug}/${doc.id}/duplicate`, {
        method: 'POST',
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const errMsg = (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message || 'Duplicate failed'
        setError(errMsg)
        return
      }
      const body = (await response.json()) as { doc?: { title?: string; id?: unknown } }
      const newTitle = body.doc?.title || `#${body.doc?.id}`
      setToast({ message: `Duplicated as ${newTitle}`, url: `/admin/collections/${collectionSlug}/${body.doc?.id}` })
      router.refresh()
    } catch {
      setError('Duplicate failed - check your connection')
    } finally {
      setIsDuplicating(false)
    }
  }

  const handleQuickEditSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const patch = buildQuickEditPatch(doc, editData)
      if (Object.keys(patch).length === 0) {
        setShowQuickEdit(false)
        return
      }

      const response = await fetch(`/api/${collectionSlug}/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const errMsg = (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message || 'Save failed'
        setError(errMsg)
        return
      }

      setShowQuickEdit(false)
      setToast({ message: 'Saved' })
      router.refresh()
    } catch {
      setError('Save failed - check your connection')
    } finally {
      setIsSaving(false)
    }
  }

  // Get descendants for parent picker exclusion
  const descendants = collectionSlug === 'pages' ? getDescendantIds(doc.id as number | string, pages) : new Set()
  const availableParents = pages.filter((p) => p.id !== doc.id && !descendants.has(p.id))

  return (
    <>
      <div className="list-row-actions">
        {canDuplicate && (
          <button
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="list-row-action-btn"
            title="Duplicate this document"
          >
            {isDuplicating ? '...' : 'Duplicate'}
          </button>
        )}
        {canUpdate && (
          <button
            onClick={() => setShowQuickEdit(true)}
            className="list-row-action-btn"
            title="Quick edit title, slug, status"
          >
            Quick edit
          </button>
        )}
      </div>

      {showQuickEdit &&
        createPortal(
          <div className="list-quick-edit-overlay">
            <div className="list-quick-edit-panel" ref={modalRef}>
              <div className="list-quick-edit-header">
                <h3 className="list-quick-edit-title">Quick edit</h3>
                <button
                  onClick={() => setShowQuickEdit(false)}
                  className="list-quick-edit-close"
                  type="button"
                >
                  ✕
                </button>
              </div>

              <div className="list-quick-edit-body">
                <div className="list-quick-edit-field">
                  <label htmlFor="quick-edit-title" className="list-quick-edit-label">
                    Title
                  </label>
                  <input
                    id="quick-edit-title"
                    type="text"
                    value={editData.title || ''}
                    onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                    className="list-quick-edit-input"
                  />
                </div>

                <div className="list-quick-edit-field">
                  <label htmlFor="quick-edit-slug" className="list-quick-edit-label">
                    Slug
                  </label>
                  <input
                    id="quick-edit-slug"
                    type="text"
                    value={editData.slug || ''}
                    onChange={(e) => setEditData({ ...editData, slug: e.target.value })}
                    className="list-quick-edit-input"
                  />
                </div>

                {hasDrafts && (
                  <div className="list-quick-edit-field">
                    <label htmlFor="quick-edit-status" className="list-quick-edit-label">
                      Status
                    </label>
                    <select
                      id="quick-edit-status"
                      value={editData._status || 'published'}
                      onChange={(e) => setEditData({ ...editData, _status: e.target.value as 'draft' | 'published' })}
                      className="list-quick-edit-select"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                )}

                {collectionSlug === 'pages' && (
                  <div className="list-quick-edit-field">
                    <label htmlFor="quick-edit-parent" className="list-quick-edit-label">
                      Parent
                    </label>
                    <select
                      id="quick-edit-parent"
                      value={editData.parent === null || editData.parent === undefined ? '' : editData.parent}
                      onChange={(e) => setEditData({ ...editData, parent: e.target.value ? Number(e.target.value) : null })}
                      className="list-quick-edit-select"
                    >
                      <option value="">No parent (root)</option>
                      {availableParents.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {error && <div className="list-quick-edit-error">{error}</div>}
              </div>

              <div className="list-quick-edit-footer">
                <button onClick={() => setShowQuickEdit(false)} className="list-quick-edit-cancel-btn" type="button">
                  Cancel
                </button>
                <button
                  onClick={handleQuickEditSave}
                  disabled={isSaving}
                  className="list-quick-edit-save-btn"
                  type="button"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {toast && (
        <div className="list-row-action-toast">
          {toast.message}
          {toast.url && (
            <>
              {' '}
              <a href={toast.url} className="list-row-action-toast-link">
                Edit
              </a>
            </>
          )}
        </div>
      )}
    </>
  )
}
