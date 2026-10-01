import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import { EditForm } from './EditForm'
import type { DocumentPanelInfo } from './DocumentPanel'

type AdminEngine = Awaited<ReturnType<typeof getAdminContext>>['engine']

const idOf = (value: unknown): number | string | undefined => {
  if (value && typeof value === 'object') return (value as { id?: number | string }).id
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
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

  // Stage 11 Phase 2: the reference engine's `versions` is `boolean | {drafts?: boolean | object}` -
  // a bare `false` (the 33 non-drafts collections' real, sanitized shape) carries no `.drafts`
  // at all, hence the defensive shape check rather than a direct `.versions.drafts` read.
  const versions = (collection as { versions?: unknown }).versions
  const draftsEnabled = Boolean(versions && typeof versions === 'object' && (versions as { drafts?: unknown }).drafts)
  const rawStatus = (doc as { _status?: unknown } | null)?._status
  const status = typeof rawStatus === 'string' ? rawStatus : undefined

  const pluralLabel = typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug
  const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
  const rawTitle = useAsTitle ? (doc as Record<string, unknown> | null)?.[useAsTitle] : undefined
  const docTitle = typeof rawTitle === 'string' && rawTitle ? rawTitle : undefined

  const surface = VISUAL_EDITOR_SURFACES[collectionSlug]
  const blocksField = surface?.kind === 'collection' ? surface.blocksField : undefined
  const hasBlocksField = Boolean(blocksField && collection.fields.some((field) => field.type === 'blocks' && 'name' in field && field.name === blocksField))
  const rawBlocks = blocksField && doc ? (doc as Record<string, unknown>)[blocksField] : undefined
  const blocksCount = Array.isArray(rawBlocks) ? rawBlocks.length : 0

  const docRecord = doc as Record<string, unknown> | null
  const panel: DocumentPanelInfo = {
    canCreate: Boolean(canCreate),
    canDelete: true, // the REST delete route enforces the real access check
    collectionSlug,
    createdAt: typeof docRecord?.createdAt === 'string' ? docRecord.createdAt : undefined,
    draftsEnabled,
    id,
    label,
    liveHref: docRecord ? await liveHrefFor(context.engine, collectionSlug, docRecord) : undefined,
    status,
    updatedAt: typeof docRecord?.updatedAt === 'string' ? docRecord.updatedAt : undefined,
    visualEditorHref: surface?.kind === 'collection' && id !== undefined ? `/admin/visual-editor/collection/${collectionSlug}/${id}` : undefined,
  }

  return (
    <div className="collection-edit">
      <nav aria-label="Breadcrumb" className="doc-breadcrumb" style={{ paddingLeft: 'calc(var(--base) * 2.2)' }}>
        <Link href="/admin">Dashboard</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/admin/collections/${collectionSlug}`}>{pluralLabel}</Link>
        <span aria-hidden="true">/</span>
        <span>{id === undefined ? 'Create' : docTitle || `#${id}`}</span>
      </nav>
      <h1 className="doc-title">{id === undefined ? `Create ${label}` : docTitle || `Edit ${label}`}</h1>
      <EditForm
        collectionSlug={collectionSlug}
        doc={doc}
        draftsEnabled={draftsEnabled}
        fields={sanitizeFieldsForClient(collection.fields)}
        id={id}
        panel={panel}
        visualBlocksCount={blocksCount}
        visualBlocksField={hasBlocksField ? blocksField : undefined}
      />
    </div>
  )
}

export default EditView
