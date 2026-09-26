import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { EditForm } from './EditForm'

/**
 * Generic create/edit view for any collection - blank form when `id` is
 * omitted (create), seeded from the fetched doc otherwise. Reads happen
 * through the Local API directly (`context.engine.findByID`) - see
 * ListView.tsx's own doc comment for why; writes go through EditForm's REST
 * calls instead.
 */
export async function EditView({ collectionSlug, id }: { collectionSlug: string; id?: number }) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()

  const canRead = context.permissions.collections?.[collectionSlug]?.read
  const canCreate = context.permissions.collections?.[collectionSlug]?.create
  if (id === undefined ? !canCreate : !canRead) {
    return <p>You don&apos;t have access to {id === undefined ? 'create' : 'edit'} this document.</p>
  }

  const doc = id === undefined ? null : await context.engine.findByID({ collection: collectionSlug, id, user: context.user })
  if (id !== undefined && !doc) notFound()

  const label = typeof collection.labels?.singular === 'string' ? collection.labels.singular : collectionSlug

  // Stage 11 Phase 2: real Payload's `versions` is `boolean | {drafts?: boolean | object}` -
  // a bare `false` (the 33 non-drafts collections' real, sanitized shape) carries no `.drafts`
  // at all, hence the defensive shape check rather than a direct `.versions.drafts` read.
  const versions = (collection as { versions?: unknown }).versions
  const draftsEnabled = Boolean(versions && typeof versions === 'object' && (versions as { drafts?: unknown }).drafts)
  const rawStatus = (doc as { _status?: unknown } | null)?._status
  const status = typeof rawStatus === 'string' ? rawStatus : undefined

  return (
    <div className="collection-edit">
      <h1>
        {id === undefined ? `Create ${label}` : `Edit ${label}`}
        {draftsEnabled && status && (
          <span style={{ borderRadius: 4, fontSize: '0.6em', fontWeight: 'normal', marginLeft: 12, padding: '2px 8px', textTransform: 'uppercase', verticalAlign: 'middle' }}>
            {status}
          </span>
        )}
      </h1>
      <EditForm collectionSlug={collectionSlug} doc={doc} draftsEnabled={draftsEnabled} fields={sanitizeFieldsForClient(collection.fields)} id={id} />
    </div>
  )
}

export default EditView
