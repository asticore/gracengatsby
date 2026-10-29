import { getAdminRoot } from '@/features/security/settings'
import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { adminHref } from '@/features/security/adminPath'
import { adminLabel } from '@/features/uiStrings'
import { adminCollectionPath } from '@/admin/adminPaths'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getCollectionConfig, hasAdminPanelAccess } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import type { ReactNode } from 'react'
import { EditForm } from './EditForm'
import { SignInAsCustomerButton } from '@/features/impersonation/components/SignInAsCustomerButton'
import { isCustomerRoles } from '@/features/impersonation/policy'
import { getSecuritySettings } from '@/features/security/settings'
import type { DocumentPanelInfo } from './DocumentPanel'
import { EditTabs } from './EditTabs'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { bulkPermissions, isBulkCollection } from '@/features/editScreens/authors'
import { actionRefusal } from '@/features/editScreens/bulk'
import { resultsTabState } from './results/resultsTabs'
import { ABResultsTab } from './results/ABResultsTab'
import { EventResultsTab } from './results/EventResultsTab'
import { FormResultsTab } from './results/FormResultsTab'

type AdminEngine = Awaited<ReturnType<typeof getAdminContext>>['engine']

const idOf = (value: unknown): number | string | undefined => {
  if (value && typeof value === 'object') return (value as { id?: number | string }).id
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

/** Get user display name from a user object or ID; returns name if available, else email, else the ID as string. */
function userDisplayName(user: unknown): string | undefined {
  if (!user) return undefined
  if (typeof user === 'string' || typeof user === 'number') return String(user)
  if (typeof user === 'object') {
    const u = user as { name?: unknown; email?: unknown; id?: unknown }
    if (typeof u.name === 'string' && u.name) return u.name
    if (typeof u.email === 'string' && u.email) return u.email
    if (u.id !== undefined) return String(u.id)
  }
  return undefined
}

/**
 * The panel behind an edit page's results tab, or null for a slug without one.
 * Chosen here, not in a map: the A/B panel is a server component and cannot
 * sit in a client module's map, and the other two need the document's id.
 */
function resultsPanelFor(slug: string, id: number, doc: Record<string, unknown> | null): ReactNode {
  if (slug === 'events') {
    const capacity = typeof doc?.capacity === 'number' ? doc.capacity : null
    return <EventResultsTab capacity={capacity} eventId={id} />
  }
  if (slug === 'forms') return <FormResultsTab formId={id} />
  if (slug === 'ab-tests') return <ABResultsTab testId={id} />
  return null
}

/** Public URL of a page: its slug under every ancestor's slug (the parent chain is the URL; see utilities/pagePaths.ts). */
async function pageLiveHref(engine: AdminEngine, doc: Record<string, unknown>): Promise<string | undefined> {
  if (doc.isHomepage) return '/'
  const segments: string[] = []
  let current: Record<string, unknown> | null = doc
  for (let depth = 0; current && depth < 9; depth++) {
    const slug = current.slug
    if (typeof slug !== 'string' || !slug) return undefined
    segments.unshift(slug)
    const parentId = idOf(current.parent)
    if (parentId === undefined) return `/${segments.join('/')}`
    current = (await engine.findByID({ collection: 'pages', depth: 0, id: parentId as number, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
  }
  return undefined
}

async function liveHrefFor(engine: AdminEngine, collectionSlug: string, doc: Record<string, unknown>): Promise<string | undefined> {
  if (collectionSlug === 'pages') return pageLiveHref(engine, doc)
  if (collectionSlug === 'posts' && typeof doc.slug === 'string') return `/blog/${doc.slug}`
  return undefined
}

/**
 * Generic create/edit view for any collection - blank form when `id` is
 * omitted (create), seeded from the fetched doc otherwise. Reads happen
 * through the Local API directly (`context.engine.findByID`) - see
 * ListView.tsx's own doc comment for why; writes go through EditForm's REST
 * calls instead.
 */
export async function EditView({ collectionSlug, id }: { collectionSlug: string; id?: number }) {
  const ui = await getAdminUi()
  const context = await getAdminContext()
  const hasAdminAccess = hasAdminPanelAccess(context.user)
  if (!hasAdminAccess) redirect(adminHref('/login', await getAdminRoot()))

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()

  const canRead = context.permissions.collections?.[collectionSlug]?.read
  const canCreate = context.permissions.collections?.[collectionSlug]?.create
  const canUpdate = context.permissions.collections?.[collectionSlug]?.update
  const canDelete = context.permissions.collections?.[collectionSlug]?.delete
  if (id === undefined ? !canCreate : !canRead) {
    return <p>You don&apos;t have access to {id === undefined ? 'create' : 'edit'} this document.</p>
  }

  const doc = id === undefined ? null : await context.engine.findByID({ collection: collectionSlug, id, user: context.user })
  if (id !== undefined && !doc) notFound()

  const label = ui.label('singular', collectionSlug, typeof collection.labels?.singular === 'string' ? collection.labels.singular : collectionSlug)

  // Stage 11 Phase 2: the reference engine's `versions` is `boolean | {drafts?: boolean | object}` -
  // a bare `false` (the 33 non-drafts collections' real, sanitized shape) carries no `.drafts`
  // at all, hence the defensive shape check rather than a direct `.versions.drafts` read.
  const versions = (collection as { versions?: unknown }).versions
  const draftsEnabled = Boolean(versions && typeof versions === 'object' && (versions as { drafts?: unknown }).drafts)
  const rawStatus = (doc as { _status?: unknown } | null)?._status
  const status = typeof rawStatus === 'string' ? rawStatus : undefined

  const pluralLabel = adminLabel('collection', collectionSlug, typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug, ui)
  const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
  const rawTitle = useAsTitle ? (doc as Record<string, unknown> | null)?.[useAsTitle] : undefined
  const docTitle = typeof rawTitle === 'string' && rawTitle ? rawTitle : undefined

  const surface = VISUAL_EDITOR_SURFACES[collectionSlug]
  const blocksField = surface?.kind === 'collection' ? surface.blocksField : undefined
  const hasBlocksField = Boolean(blocksField && collection.fields.some((field) => field.type === 'blocks' && 'name' in field && field.name === blocksField))
  const rawBlocks = blocksField && doc ? (doc as Record<string, unknown>)[blocksField] : undefined
  const blocksCount = Array.isArray(rawBlocks) ? rawBlocks.length : 0

  const docRecord = doc as Record<string, unknown> | null

  // Resolve updatedBy and createdBy display names (relationship may be an id or a populated user).
  const resolveName = async (value: unknown): Promise<string | undefined> => {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'object') return userDisplayName(value)
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return userDisplayName(value)
    const user = await context.engine.findByID({ collection: 'users', id: numeric, depth: 0, overrideAccess: true }).catch((): null => null)
    return userDisplayName(user) ?? userDisplayName(value)
  }
  const updatedByName = docRecord ? await resolveName(docRecord.updatedBy) : undefined
  const createdByName = docRecord ? await resolveName(docRecord.createdBy) : undefined

  const trackAuthorship = collection.fields.some((f) => 'name' in f && f.name === 'createdBy')

  const panel: DocumentPanelInfo = {
    canCreate: Boolean(canCreate),
    canDelete: Boolean(canDelete),
    canPreview: id !== undefined && (collectionSlug === 'pages' || collectionSlug === 'posts'),
    canUpdate: Boolean(canUpdate),
    trashEnabled: isBulkCollection(collectionSlug),
    trashedAt: typeof docRecord?.trashedAt === 'string' ? docRecord.trashedAt : undefined,
    canEditSeo: context.isAdmin || context.can('content.editSeo', 'update'),
    canChangeAuthor: id !== undefined && isBulkCollection(collectionSlug) && actionRefusal('changeAuthor', bulkPermissions(context as never, collectionSlug)) === null,
    authorId: Number(idOf(docRecord?.createdBy) ?? idOf(docRecord?.author)) || undefined,
    collectionSlug,
    createdAt: typeof docRecord?.createdAt === 'string' ? docRecord.createdAt : undefined,
    createdByName,
    draftsEnabled,
    id,
    label,
    liveHref: docRecord ? await liveHrefFor(context.engine, collectionSlug, docRecord) : undefined,
    status,
    trackAuthorship,
    updatedAt: typeof docRecord?.updatedAt === 'string' ? docRecord.updatedAt : undefined,
    updatedByName,
    visualEditorHref: surface?.kind === 'collection' && id !== undefined ? adminHref(`/visual-editor/collection/${collectionSlug}/${id}`, await getAdminRoot()) : undefined,
  }

  // Extract pageType field if it exists
  const pageTypeField = collection.fields.find((f) => f.type === 'select' && 'name' in f && f.name === 'schemaType')

  // Existing documents only: a results tab, if the user may read what it shows.
  const resultsTab = resultsTabState(collectionSlug, id, {
    isAdmin: context.isAdmin,
    canRead: (slug) => Boolean(context.permissions.collections?.[slug]?.read),
    canUpdate: (slug) => Boolean(context.permissions.collections?.[slug]?.update),
  })
  const resultsPanel = resultsTab?.allowed && id !== undefined ? resultsPanelFor(collectionSlug, id, docRecord) : null

  // "Sign in as" on an admin's view of a customer account. Shown to admins only, with the feature on,
  // for a customer that is not the admin themselves. The server repeats every one of these checks.
  const signInAs =
    collectionSlug === 'users' && id !== undefined && context.isAdmin && docRecord && isCustomerRoles(docRecord.roles) && Number(id) !== Number((context.user as { id?: unknown } | null)?.id)
      ? await signInAsFor(context.engine, String(docRecord.email ?? ''))
      : null

  const editForm = (
    <EditForm
      collectionSlug={collectionSlug}
      doc={doc}
      draftsEnabled={draftsEnabled}
      fields={sanitizeFieldsForClient(collection.fields)}
      id={id}
      pageTypeField={pageTypeField ? sanitizeFieldsForClient([pageTypeField])[0] : undefined}
      panel={panel}
      visualBlocksCount={blocksCount}
      visualBlocksField={hasBlocksField ? blocksField : undefined}
    />
  )

  return (
    <div className="collection-edit">
      <nav aria-label="Breadcrumb" className="doc-breadcrumb" style={{ paddingLeft: 'calc(var(--base) * 2.2)' }}>
        <AdminLink path="/">{ui.t('nav.dashboard')}</AdminLink>
        <span aria-hidden="true">/</span>
        <AdminLink href={`${adminCollectionPath(collectionSlug)}`}>{pluralLabel}</AdminLink>
        <span aria-hidden="true">/</span>
        <span>{id === undefined ? ui.t('edit.create') : docTitle || `#${id}`}</span>
      </nav>
      <h1 className="doc-title">{id === undefined ? ui.t('edit.createTitle', { label }) : docTitle || ui.t('edit.editTitle', { label })}</h1>
      {signInAs ? <SignInAsCustomerButton email={signInAs.email} maxMinutes={signInAs.maxMinutes} /> : null}
      {resultsTab ? (
        <EditTabs
          editLabel={ui.t('common.edit')}
          deniedReason={resultsTab.allowed ? undefined : resultsTab.deniedReason}
          edit={editForm}
          results={resultsPanel}
          resultsLabel={resultsTab.label}
        />
      ) : (
        editForm
      )}
    </div>
  )
}

export default EditView

/** The button's settings, or null when signing in as a customer is switched off or the customer has no email. */
async function signInAsFor(engine: Parameters<typeof getSecuritySettings>[0], email: string): Promise<{ email: string; maxMinutes: number } | null> {
  if (!email) return null
  const settings = await getSecuritySettings(engine)
  if (!settings.impersonation.enabled) return null
  return { email, maxMinutes: settings.impersonation.maxMinutes }
}
