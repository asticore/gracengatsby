import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'

/**
 * Generic list view for any collection - one component instead of 21
 * hand-written list screens, driven off the collection's own real config
 * (`.admin.defaultColumns`/`.useAsTitle`, already plain data - see the plan
 * doc's "Key discovery").
 *
 * Reads happen through the Local API directly (`context.engine.find`), not a
 * self-fetch to `/api/<slug>` - this is already a server component with a
 * live `Engine` instance and the caller's own resolved `user`, so a round
 * trip through our own REST layer would just be slower for no benefit. Saves
 * (Task: EditView) go through the REST API instead, because those need to
 * happen from a CLIENT component for interactivity - see EditForm.tsx.
 */
export async function ListView({ collectionSlug }: { collectionSlug: string }) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()
  if (!context.permissions.collections?.[collectionSlug]?.read) {
    return <p>You don&apos;t have access to {collectionSlug}.</p>
  }

  const result = await context.engine.find({
    collection: collectionSlug,
    limit: 50,
    user: context.user,
  })

  const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
  const configuredColumns = (collection.admin as { defaultColumns?: string[] } | undefined)?.defaultColumns
  const columns = configuredColumns?.length ? configuredColumns : [useAsTitle || 'id']

  const canCreate = context.permissions.collections?.[collectionSlug]?.create

  const label =
    typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug

  return (
    <div className="collection-list">
      <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1>{label}</h1>
        {canCreate && <Link href={`/admin/collections/${collectionSlug}/create`}>Create new</Link>}
      </div>

      {result.docs.length === 0 ? (
        <p>No documents yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} style={{ borderBottom: '1px solid #ccc', padding: 8, textAlign: 'left' }}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.docs.map((doc) => (
              <tr key={doc.id}>
                {columns.map((column, index) => {
                  const cell = doc[column]
                  const text = cell === undefined || cell === null ? '' : typeof cell === 'object' ? JSON.stringify(cell) : String(cell)
                  return (
                    <td key={column} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                      {index === 0 ? (
                        <Link href={`/admin/collections/${collectionSlug}/${doc.id}`}>{text || `#${doc.id}`}</Link>
                      ) : (
                        text
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: 12, opacity: 0.7 }}>
        {result.totalDocs} total{result.totalDocs > result.docs.length ? ` (showing first ${result.docs.length})` : ''}
      </p>
    </div>
  )
}

export default ListView
