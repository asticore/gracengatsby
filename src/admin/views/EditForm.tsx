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
import { flattenDoc, fieldLabel, humanizeName } from '@/admin/fields/shared'
import { DocumentPanel, type DocumentPanelInfo } from './DocumentPanel'
import { PageSpeedCard } from '@/features/pagespeed/ui/PageSpeedCard'
import { isPageSpeedCollection } from '@/features/pagespeed/types'
import { SeoCard } from './SeoCard'
import { TrashBanner } from '@/features/editScreens/admin/TrashBanner'
import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { CollapseAllBar } from '@/admin/components/CollapseAllBar'
import { SectionOutline } from '@/admin/components/SectionOutline'
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
  /** The schemaType field extracted by splitFields, to pass to DocumentPanel. */
  pageTypeField?: Field
  /**
   * Show only these top-level group fields (by name). Ungrouped top-level
   * fields are dropped too. Used to show a subset of a global. Every field
   * stays in form state, so a save still sends the hidden ones back unchanged.
   * With exactly one name, that group's fields render without a card.
   */
  onlyGroups?: string[]
  /** Hide these top-level group fields (by name). Same save behaviour as onlyGroups. */
  excludeGroups?: string[]
  /**
   * Show only the top-level fields with these names (groups, arrays or plain fields). A row or
   * collapsible is kept when any field inside it is named. Every field stays in form state, so a
   * save still sends the hidden ones back unchanged. Used to split one global across tabs.
   */
  onlyFields?: string[]
  /** Extra content rendered inside the form provider, after the fields (so it can read live form values). */
  afterFields?: React.ReactNode
  /** Do not render this form's own Collapse all / Expand all bar (the host page renders one). Default false. */
  hideCollapseBar?: boolean
}

/**
 * Narrows the top-level fields to the group names given. `onlyGroups` keeps
 * only the named groups (and drops everything else); `excludeGroups` removes
 * the named groups. Fields that are not groups are dropped only by onlyGroups.
 */
export function scopeGroupFields(fields: Field[], scope: { onlyGroups?: string[]; excludeGroups?: string[]; onlyFields?: string[] } = {}): Field[] {
  const { onlyGroups, excludeGroups, onlyFields } = scope
  if (!onlyGroups && !excludeGroups && !onlyFields) return fields
  const hasNamed = (field: Field, names: string[]): boolean => {
    if ('name' in field && typeof field.name === 'string') return names.includes(field.name)
    if ((field.type === 'row' || field.type === 'collapsible') && 'fields' in field) return (field.fields as Field[]).some((f) => hasNamed(f, names))
    return false
  }
  return fields.filter((field) => {
    if (onlyFields && !hasNamed(field, onlyFields)) return false
    if (field.type === 'group' && 'name' in field && typeof field.name === 'string') {
      if (onlyGroups && !onlyGroups.includes(field.name)) return false
      return !excludeGroups?.includes(field.name)
    }
    return !onlyGroups || Boolean(onlyFields)
  })
}

/** One card on the non-panel form: a top-level group, a named tab, or the General bucket. */
export type FieldSection = {
  /** Stable key within one form; the card id is `<form>:<key>`. */
  key: string
  title: string
  fields: Field[]
  /** Data path the fields sit under: the group or tab name, '' for General. */
  parentPath: string
}

const isHiddenField = (field: Field): boolean => Boolean((field as { admin?: { hidden?: boolean } }).admin?.hidden)

const titleFor = (field: { label?: unknown }, name: string): string => {
  const label = fieldLabel(field as Field)
  return typeof label === 'string' ? label : humanizeName(name)
}

/**
 * Splits top-level fields into one section per group (titled by its label),
 * one per named tab, and one 'General' section holding every ungrouped field.
 * Groups come first in config order; General comes first when it exists.
 * Hidden groups are left out. A group keeps its own field wrapper, so its
 * admin conditions still apply.
 */
export function splitFieldSections(fields: Field[]): FieldSection[] {
  const general: Field[] = []
  const sections: FieldSection[] = []
  for (const field of fields) {
    if (field.type === 'group' && 'name' in field && typeof field.name === 'string') {
      if (isHiddenField(field)) continue
      sections.push({ key: field.name, title: titleFor(field, field.name), fields: [field], parentPath: '' })
    } else if (field.type === 'tabs') {
      if (isHiddenField(field)) continue
      for (const tab of field.tabs) {
        if (!('name' in tab) || !tab.name) {
          // An unnamed tab keeps its fields at the parent level, so they belong with General.
          general.push(...tab.fields)
          continue
        }
        sections.push({ key: tab.name, title: titleFor(tab as { label?: unknown }, tab.name), fields: tab.fields, parentPath: tab.name })
      }
    } else {
      general.push(field)
    }
  }
  if (general.length > 0) sections.unshift({ key: '_general', title: 'General', fields: general, parentPath: '' })
  return sections
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

const isSettingsField = (field: Field): boolean => (field as { admin?: { position?: string } }).admin?.position === 'sidebar'

/** Main column vs settings card, by `admin.position`; the visual editor's blocks field is dropped from the main column; the seo, access (membersOnly), and pageType groups are extracted separately. */
export function splitFields(fields: Field[], visualBlocksField?: string): { main: Field[]; settings: Field[]; access?: Field; seo?: Field; pageType?: Field } {
  const main: Field[] = []
  const settings: Field[] = []
  let access: Field | undefined
  let seo: Field | undefined
  let pageType: Field | undefined
  for (const field of fields) {
    if (field.type === 'group' && 'name' in field && field.name === 'membersOnly') {
      access = field
    } else if (field.type === 'group' && 'name' in field && field.name === 'seo') {
      seo = field
    } else if (field.type === 'select' && 'name' in field && field.name === 'schemaType') {
      pageType = field
    } else if (isSettingsField(field)) settings.push(field)
    else if (visualBlocksField && field.type === 'blocks' && 'name' in field && field.name === visualBlocksField) continue
    else main.push(field)
  }
  return { main, settings, access, seo, pageType }
}

const PageContentCard: React.FC<{ count?: number; isNew: boolean; blocksField: string }> = ({ count, isNew, blocksField }) => (
  <CollapsibleCard id="page-content" title="Page content" className="doc-content-card">
    <p className="doc-muted">
      {isNew
        ? 'Save first, then use "Edit in visual editor" in the panel to build the layout.'
        : `${count ?? 0} ${count === 1 ? 'section' : 'sections'}. The layout is edited in the visual editor.`}
    </p>
    <SectionOutline blocksField={blocksField} />
  </CollapsibleCard>
)

export const EditForm: React.FC<EditFormProps> = ({
  afterFields,
  collectionSlug,
  doc,
  draftsEnabled,
  excludeGroups,
  onlyFields,
  fields,
  globalSlug,
  hideCollapseBar = false,
  id,
  onlyGroups,
  panel,
  pageTypeField,
  readOnly,
  visualBlocksCount,
  visualBlocksField,
}) => {
  // Built from ALL fields (including the ones hidden from view) so a save sends them back untouched.
  const initialFields = useMemo(() => (doc ? flattenDoc(doc, fields) : {}), [doc, fields])
  const scoped = useMemo(() => scopeGroupFields(fields, { onlyGroups, excludeGroups, onlyFields }), [fields, onlyGroups, excludeGroups, onlyFields])
  const { main, settings, access, seo, pageType } = useMemo(() => (panel ? splitFields(scoped, visualBlocksField) : { main: scoped, settings: [], access: undefined, seo: undefined, pageType: undefined }), [scoped, panel, visualBlocksField])
  const sections = useMemo(() => (panel ? [] : splitFieldSections(scoped)), [panel, scoped])
  // Use either the extracted pageType or the one passed in (EditView extracts and passes it)
  const resolvedPageTypeField = pageTypeField || pageType
  // One named group on its own reads as plain fields, not a card.
  const flat = onlyGroups?.length === 1 || (Boolean(onlyFields) && scoped.length === 1 && scoped[0].type === 'group')
  const cardScope = globalSlug ?? collectionSlug ?? 'form'

  return (
    <DocumentInfoProvider value={{ collectionSlug, globalSlug, id }}>
      <FormProvider initialFields={initialFields}>
        {panel ? (
          <div className="document-edit">
            <div className="document-edit__main">
              {panel.trashedAt && panel.id !== undefined && collectionSlug && (
                <TrashBanner canDelete={panel.canDelete} collectionSlug={collectionSlug} id={panel.id} label={panel.label} trashedAt={panel.trashedAt} />
              )}
              {!hideCollapseBar && <CollapseAllBar />}
              <div className="collection-edit__form">
                {main.length > 0 && (
                  <CollapsibleCard id="main-fields" title="Content">
                    <FieldRenderer fields={main} readOnly={readOnly} />
                  </CollapsibleCard>
                )}
                {settings.length > 0 && (
                  <CollapsibleCard id="settings" title="Settings" className="doc-settings-card">
                    <div className="doc-settings">
                      <FieldRenderer fields={settings} readOnly={readOnly} />
                    </div>
                  </CollapsibleCard>
                )}
                {access && (
                  <CollapsibleCard id="access" title="Access" className="doc-access-card">
                    <div className="doc-access">
                      <FieldRenderer fields={[access]} readOnly={readOnly} />
                    </div>
                  </CollapsibleCard>
                )}
                {seo && (
                  <>
                    {panel.canEditSeo === false && <p className="doc-muted">Your role cannot edit SEO settings, so they are shown read-only.</p>}
                    <SeoCard seoField={seo} readOnly={readOnly || panel.canEditSeo === false} liveHref={panel.liveHref} />
                  </>
                )}
                {isPageSpeedCollection(collectionSlug) && <PageSpeedCard collectionSlug={collectionSlug} id={id} />}
                {visualBlocksField && <PageContentCard blocksField={visualBlocksField} count={visualBlocksCount} isNew={id === undefined} />}
              </div>
            </div>
            <aside className="document-edit__side">
              <DocumentPanel info={panel} readOnly={readOnly} pageTypeField={resolvedPageTypeField} />
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
                {flat ? (
                  sections.map((section) => <FieldRenderer key={section.key} fields={section.fields} parentPath={section.parentPath} readOnly={readOnly} />)
                ) : (
                  <>
                    {sections.length > 0 && !hideCollapseBar && <CollapseAllBar />}
                    {sections.map((section) => (
                      <CollapsibleCard key={section.key} id={`${cardScope}:${section.key}`} title={section.title} className="doc-group-card">
                        <FieldRenderer fields={section.fields} parentPath={section.parentPath} readOnly={readOnly} />
                      </CollapsibleCard>
                    ))}
                  </>
                )}
                {afterFields}
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