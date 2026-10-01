import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { VersionsList } from './VersionsList'

/**
 * Server component for the versions list view. Fetches the current document
 * and renders the client component with title field and doc snapshot.
 * Follows the same auth/permission/notFound pattern as EditView.
 */
export async function VersionsView({ collectionSlug, id }: { collectionSlug: string; id: number }) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()

  // 404 if the collection has no versions config
  const versions = (collection as { versions?: unknown }).versions
  if (!versions || typeof versions !== 'object') notFound()

  const canRead = context.permissions.collections?.[collectionSlug]?.read
  if (!canRead) {
    return <p>You don&apos;t have access to this collection.</p>
  }

  const doc = await context.engine.findByID({ collection: collectionSlug, id, user: context.user })
  if (!doc) notFound()

  const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
  const titleValue = useAsTitle ? String(doc[useAsTitle]) : `${id}`

  return (
    <div className="collection-versions">
      <div className="flex items-center justify-between mb-[calc(var(--base)*0.9)]">
        <h1>Versions: {titleValue}</h1>
      </div>
      <a href={`/admin/collections/${collectionSlug}/${id}`} className="btn btn--secondary mb-[calc(var(--base)*0.9)]">
        Back to document
      </a>
      <VersionsList collectionSlug={collectionSlug} id={id} currentDoc={doc} titleField={useAsTitle || 'id'} />
    </div>
  )
}

export default VersionsView
