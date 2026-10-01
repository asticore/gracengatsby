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
 * `engage-token` cookie only flows automatically into a real HTTP request,
 * not a server-side Local API call made on this component's behalf. See
 * `src/localapi/rest.ts`'s own doc comment for the exact wire shapes relied
 * on below:
 *   - `POST /api/<collection>` (create): `{doc, message}`, 201.
 *   - `PATCH /api/<collection>/:id` (update): `{doc, message}`, 200.
 *   - `POST /api/globals/<slug>` (global update - POST, not PATCH):
 *     `{result, message}`, 200 - the one collection/global response-shape
 *     divergence `rest.ts` itself flags.
 * A plain JSON body (not multipart/`_data`) is fine for every non-upload
 * collection - `readRequestBody` only reaches for its multipart parser when
 * the request's own `Content-Type` says so (see that function's doc comment)
 * - and no upload-collection document is ever edited through this form yet
 * (`media`'s own file field is still FieldRenderer's `RelationshipStopgap`,
 * a by-ID text input, not a real file picker - Phase 3 polish item).
 */

import React, { useMemo } from 'react'
import type { Field } from '@/engine'
import { DocumentInfoProvider, FormProvider } from '@/admin/context'
import { FieldRenderer } from '@/admin/fields/FieldRenderer'
import { flattenDoc } from '@/admin/fields/shared'
import { DocumentPanel, type DocumentPanelInfo } from './DocumentPanel'
import { useDocumentSave, type SaveTarget } from './useDocumentSave'

export type EditFormProps = {
  collectionSlug?: string
  globalSlug?: string
  id?: number
  doc: Record<string, unknown> | null
  fields: Field[]
  readOnly?: boolean
  /** Stage 11 Phase 2: true for one of the 5 `versions: {drafts: true}` collections - see SaveButton's doc comment for what this changes. Globals never have drafts in this app, so GlobalEditView never sets it. */
  draftsEnabled?: boolean
  /** Collections only: turns on the two-column layout with the right-hand DocumentPanel. */
  panel?: DocumentPanelInfo
  /**
   * Name of the page-builder `blocks` field that the visual editor owns. It is
   * left out of this form (still held in form state, so every save sends it
   * back unchanged) and replaced by a small "Page content" card.
   */
  visualBlocksField?: string
  /** Section count of the stored page-builder field, for the card. */
  visualBlocksCount?: number
}

/**
 * Plain single-button save bar for globals and the few places that do not
 * use the panel. A `draftsEnabled` collection gets Save Draft + Publish,
 * everything else keeps the old single "Save" button - the request rules
 * (draft flag, `_status`) live in `useDocumentSave`.
 */
const SaveButton: React.FC<SaveTarget> = (target) => {
  const { busy, error, save } = useDocumentSave(target)
  const { draftsEnabled } = target
  return (
    <div style={{ alignItems: 'center', display: 'flex', gap: 12, marginTop: 24 }}>
      {draftsEnabled && (
        <button className="btn" disabled={busy !== null} onClick={() => save('draft')} type="button">
          {busy === 'draft' ? 'Saving…' : 'Save Draft'}
        </button>
      )}
      <button className="btn btn--primary" disabled={busy !== null} onClick={() => save('published')} type="button">
        {busy === 'published' ? 'Saving…' : draftsEnabled ? 'Publish' : 'Save'}
      </button>
      {error && <span style={{ color: 'var(--theme-error-500, #b3261e)' }}>{error}</span>}
    </div>
  )
}

const isSidebarField = (field: Field): boolean => (field as { admin?: { position?: string } }).admin?.position === 'sidebar'

/** Main column vs right panel, by `admin.position`; the visual editor's blocks field is dropped from the main column. */
export function splitFields(fields: Field[], visualBlocksField?: string): { main: Field[]; sidebar: Field[] } {
  const main: Field[] = []
  const sidebar: Field[] = []
  for (const field of fields) {
    if (isSidebarField(field)) sidebar.push(field)
    else if (visualBlocksField && field.type === 'blocks' && 'name' in field && field.name === visualBlocksField) continue
    else main.push(field)
  }
  return { main, sidebar }
}

const PageContentCard: React.FC<{ count?: number; href?: string; isNew: boolean }> = ({ count, href, isNew }) => (
  <div className="doc-content-card">
    <div>
      <strong>Page content</strong>
      <p className="doc-muted">
        {isNew
          ? 'Save first, then open the visual editor to build the layout.'
          : `${count ?? 0} ${count === 1 ? 'section' : 'sections'}. The layout is edited in the visual editor.`}
      </p>
    </div>
    {href && !isNew && (
      <a className="btn btn--primary" href={href}>
        Edit in visual editor
      </a>
    )}
  </div>
)

export const EditForm: React.FC<EditFormProps> = ({
  collectionSlug,
  doc,
  draftsEnabled,
  fields,
  globalSlug,
  id,
  panel,
  readOnly,
  visualBlocksCount,
  visualBlocksField,
}) => {
  // Built from ALL fields (including the one hidden from view) so a save sends it back untouched.
  const initialFields = useMemo(() => (doc ? flattenDoc(doc, fields) : {}), [doc, fields])
  const { main, sidebar } = useMemo(() => (panel ? splitFields(fields, visualBlocksField) : { main: fields, sidebar: [] }), [fields, panel, visualBlocksField])

  return (
    <DocumentInfoProvider value={{ collectionSlug, globalSlug, id }}>
      <FormProvider initialFields={initialFields}>
        {panel ? (
          <div className="document-edit">
            <div className="document-edit__main">
              <div className="collection-edit__form">
                <FieldRenderer fields={main} readOnly={readOnly} />
                {visualBlocksField && <PageContentCard count={visualBlocksCount} href={panel.visualEditorHref} isNew={id === undefined} />}
              </div>
            </div>
            <aside className="document-edit__side">
              <DocumentPanel info={panel} readOnly={readOnly} sidebarFields={sidebar} />
            </aside>
          </div>
        ) : (
          /* Was a single flat `edit-form` div, which matched zero CSS rules.
             This nesting matches both stock admin CSS (`document-fields`) and
             custom.css's soft-card theming (`collection-edit__form` /
             `global-edit__form`). */
          <div className="document-fields">
            <div className="document-fields__edit">
              <div className={globalSlug ? 'global-edit__form' : 'collection-edit__form'}>
                <FieldRenderer fields={fields} readOnly={readOnly} />
                {!readOnly && <SaveButton collectionSlug={collectionSlug} draftsEnabled={draftsEnabled} globalSlug={globalSlug} id={id} />}
              </div>
            </div>
          </div>
        )}
      </FormProvider>
    </DocumentInfoProvider>
  )
}

export default EditForm
