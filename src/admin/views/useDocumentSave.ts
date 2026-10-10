'use client'

/**
 * Save/publish/duplicate/delete requests for the document edit screen.
 *
 * Shared by the plain save bar (globals and non-drafts collections, in
 * EditForm.tsx) and the right-hand DocumentPanel (collections), so the wire
 * rules live in exactly one place:
 *
 *   - Save draft: `_status: 'draft'` in the body AND `?draft=true`. On an
 *     update that writes only a new version row and leaves the live row
 *     alone; on a create it lets validation skip incomplete required fields.
 *   - Publish / Update: `_status: 'published'`, no query flag.
 *   - Unpublish: `_status: 'draft'`, NO query flag, so the live row itself
 *     goes back to draft.
 *   - Globals are POSTed, never PATCHed, and never have drafts in this app.
 *
 * See `src/localapi/rest.ts` for the response shapes relied on here
 * (`{doc, message}` for create/update, `{result, message}` for globals).
 */

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useDocumentEvents, useFormFields, useResetFormModified } from '@/admin/context'
import { unflattenFields } from '@/admin/fields/shared'

export type SaveTarget = {
  collectionSlug?: string
  globalSlug?: string
  id?: number
  draftsEnabled?: boolean
}

export type SaveStatus = 'draft' | 'published' | 'unpublish'

function saveRequest({ collectionSlug, globalSlug, id }: SaveTarget, draftFlag: boolean): { url: string; method: 'POST' | 'PATCH' } {
  const suffix = draftFlag ? '?draft=true' : ''
  if (globalSlug) return { url: `/api/globals/${globalSlug}`, method: 'POST' }
  if (id) return { url: `/api/${collectionSlug}/${id}${suffix}`, method: 'PATCH' }
  return { url: `/api/${collectionSlug}${suffix}`, method: 'POST' }
}

export function extractErrorMessage(body: unknown, fallback = 'Save failed.'): string {
  const errors = (body as { errors?: Array<{ message?: string }> } | null)?.errors
  return errors?.[0]?.message || fallback
}

export type BusyAction = SaveStatus | 'duplicate' | 'delete'

export function useDocumentSave(target: SaveTarget) {
  const router = useRouter()
  const resetModified = useResetFormModified()
  const { reportUpdate } = useDocumentEvents()
  const fields = useFormFields(([f]) => f)
  const [busy, setBusy] = useState<BusyAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const entitySlug = target.collectionSlug ?? target.globalSlug ?? ''

  /** Resolves true when the document was saved, false when it was not (the error is in `error`). */
  const save = async (status: SaveStatus): Promise<boolean> => {
    setBusy(status)
    setError(null)
    try {
      const data = unflattenFields(fields)
      if (target.draftsEnabled) data._status = status === 'published' ? 'published' : 'draft'
      // Only "Save draft" carries the flag; unpublish must write the live row.
      const { url, method } = saveRequest(target, status === 'draft')
      const response = await fetch(url, {
        body: JSON.stringify(data),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method,
      })
      const body: unknown = await response.json().catch((): unknown => null)
      if (!response.ok) {
        setError(extractErrorMessage(body))
        return false
      }

      resetModified()
      setSavedAt(Date.now())
      reportUpdate({ entitySlug, updatedAt: new Date().toISOString() })

      // A successful CREATE moves to the new document's own edit route.
      if (target.collectionSlug && !target.id) {
        const newId = (body as { doc?: { id?: number } } | null)?.doc?.id
        if (newId !== undefined) {
          router.push(`/admin/collections/${target.collectionSlug}/${newId}`)
          return true
        }
      }
      router.refresh()
      return true
    } catch {
      setError('Save failed - check your connection and try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  /** Creates a draft copy of the current form values and opens it. */
  const duplicate = async () => {
    if (!target.collectionSlug || !target.id) return
    setBusy('duplicate')
    setError(null)
    try {
      const data = unflattenFields(fields)
      delete data.id
      delete data.slug // regenerated from the new title by the slug hook
      delete data.createdAt
      delete data.updatedAt
      if ('isHomepage' in data) data.isHomepage = false
      for (const key of ['title', 'name']) {
        if (typeof data[key] === 'string' && data[key]) {
          data[key] = `${data[key]} (copy)`
          break
        }
      }
      if (target.draftsEnabled) data._status = 'draft'
      const response = await fetch(`/api/${target.collectionSlug}${target.draftsEnabled ? '?draft=true' : ''}`, {
        body: JSON.stringify(data),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body: unknown = await response.json().catch((): unknown => null)
      if (!response.ok) {
        setError(extractErrorMessage(body, 'Could not duplicate.'))
        return
      }
      const newId = (body as { doc?: { id?: number } } | null)?.doc?.id
      reportUpdate({ entitySlug, updatedAt: new Date().toISOString() })
      router.push(newId !== undefined ? `/admin/collections/${target.collectionSlug}/${newId}` : `/admin/collections/${target.collectionSlug}`)
    } catch {
      setError('Could not duplicate - check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!target.collectionSlug || !target.id) return
    setBusy('delete')
    setError(null)
    try {
      const response = await fetch(`/api/${target.collectionSlug}/${target.id}`, { credentials: 'include', method: 'DELETE' })
      if (!response.ok) {
        const body: unknown = await response.json().catch((): unknown => null)
        setError(extractErrorMessage(body, 'Could not delete.'))
        return
      }
      resetModified()
      reportUpdate({ entitySlug, updatedAt: new Date().toISOString() })
      router.push(`/admin/collections/${target.collectionSlug}`)
      router.refresh()
    } catch {
      setError('Could not delete - check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  return { busy, duplicate, error, remove, save, savedAt }
}