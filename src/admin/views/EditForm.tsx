'use client'

/**
 * Shared client form behind both EditView (collections) and GlobalEditView -
 * one component instead of two near-identical ones, matching ListView's own
 * "one generic component driven off real config data" approach (Stage 11
 * Phase 1).
 *
 * Renders `fields: Field[]` via FieldRenderer (already collection/global-
 * agnostic - it only ever sees a `Field[]` and a path prefix), inside a
 * FormProvider seeded from the fetched `doc` (`flattenDoc`, `@/admin/fields/
 * shared`) - or an empty map for a brand-new collection document being
 * created (`doc: null`, globals are never "created", only ever updated).
 *
 * WRITES go through the REST API (`fetch`), not the Local API directly -
 * unlike ListView/EditView's/GlobalEditView's reads. Two reasons: this is a
 * CLIENT component (the interactive form itself), and the browser's own
 * `payload-token` cookie only flows automatically into a real HTTP request,
 * not a server-side Local API call made on this component's behalf. See
 * `src/localapi/rest.ts`'s own doc comment for the exact wire shapes relied
 * on below:
 *   - `POST /api/<collection>` (create): `{doc, message}`, 201.
 *   - `PATCH /api/<collection>/:id` (update): `{doc, message}`, 200.
 *   - `POST /api/globals/<slug>` (global update - POST, not PATCH):
 *     `{result, message}`, 200 - the one collection/global response-shape
 *     divergence `rest.ts` itself flags.
 * A plain JSON body (not multipart/`_payload`) is fine for every non-upload
 * collection - `readRequestBody` only reaches for its multipart parser when
 * the request's own `Content-Type` says so (see that function's doc comment)
 * - and no upload-collection document is ever edited through this form yet
 * (`media`'s own file field is still FieldRenderer's `RelationshipStopgap`,
 * a by-ID text input, not a real file picker - Phase 3 polish item).
 */

import { useRouter } from 'next/navigation'
import React, { useMemo, useState } from 'react'
import type { Field } from '@/engine'
import { DocumentInfoProvider, FormProvider, useDocumentEvents, useFormFields, useResetFormModified } from '@/admin/context'
import { FieldRenderer } from '@/admin/fields/FieldRenderer'
import { flattenDoc, unflattenFields } from '@/admin/fields/shared'

export type EditFormProps = {
  collectionSlug?: string
  globalSlug?: string
  id?: number
  doc: Record<string, unknown> | null
  fields: Field[]
  readOnly?: boolean
}

type SaveTarget = { collectionSlug?: string; globalSlug?: string; id?: number }

function saveRequest({ collectionSlug, globalSlug, id }: SaveTarget): { url: string; method: 'POST' | 'PATCH' } {
  if (globalSlug) return { url: `/api/globals/${globalSlug}`, method: 'POST' }
  if (id) return { url: `/api/${collectionSlug}/${id}`, method: 'PATCH' }
  return { url: `/api/${collectionSlug}`, method: 'POST' }
}

function extractErrorMessage(body: unknown): string {
  const errors = (body as { errors?: Array<{ message?: string }> } | null)?.errors
  return errors?.[0]?.message || 'Save failed.'
}

const SaveButton: React.FC<SaveTarget> = ({ collectionSlug, globalSlug, id }) => {
  const router = useRouter()
  const resetModified = useResetFormModified()
  const { reportUpdate } = useDocumentEvents()
  const fields = useFormFields(([f]) => f)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const data = unflattenFields(fields)
      const { url, method } = saveRequest({ collectionSlug, globalSlug, id })
      const response = await fetch(url, {
        body: JSON.stringify(data),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method,
      })
      const body: unknown = await response.json().catch((): unknown => null)

      if (!response.ok) {
        setError(extractErrorMessage(body))
        return
      }

      resetModified()
      reportUpdate({ entitySlug: collectionSlug ?? globalSlug ?? '', updatedAt: new Date().toISOString() })

      // A successful CREATE (no `id` yet, a real collection doc) moves the
      // URL to the new document's own edit route - matching real Payload's
      // own post-create-redirect behavior, and giving the now-existing `id`
      // to every subsequent save on this same document.
      if (collectionSlug && !id) {
        const newId = (body as { doc?: { id?: number } } | null)?.doc?.id
        if (newId !== undefined) {
          router.push(`/admin/collections/${collectionSlug}/${newId}`)
          return
        }
      }

      router.refresh()
    } catch {
      setError('Save failed - check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 12, marginTop: 24 }}>
      <button disabled={saving} onClick={handleSave} type="button">
        {saving ? 'Saving…' : 'Save'}
      </button>
      {error && <span style={{ color: '#b3261e' }}>{error}</span>}
    </div>
  )
}

export const EditForm: React.FC<EditFormProps> = ({ collectionSlug, doc, fields, globalSlug, id, readOnly }) => {
  const initialFields = useMemo(() => (doc ? flattenDoc(doc, fields) : {}), [doc, fields])

  return (
    <DocumentInfoProvider value={{ collectionSlug, globalSlug, id }}>
      <FormProvider initialFields={initialFields}>
        <div className="edit-form">
          <FieldRenderer fields={fields} readOnly={readOnly} />
          {!readOnly && <SaveButton collectionSlug={collectionSlug} globalSlug={globalSlug} id={id} />}
        </div>
      </FormProvider>
    </DocumentInfoProvider>
  )
}

export default EditForm
