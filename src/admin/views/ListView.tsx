import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Field } from '@/engine'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { resolveCellFormatter } from '@/admin/cellRegistry'

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
 *
 * A column's own `admin.components.Cell` override (a `'<path>#<Export>'`
 * string, same convention as `admin.components.Field` - see
 * `@/admin/cellRegistry.ts`) always wins over the raw `String(doc[column])`
 * fallback - added 2026-09-26 (ecommerce cutover, PriceCell gap; see plan
 * doc). `findColumnField` only descends into `row`/`collapsible` (pure
 * layout, no path segment - `shared.ts`'s `childPath`), matching the
 * pre-existing `doc[column]` lookup's own limitation: a field nested in a
 * `group`/`tabs`/`array`/`blocks` was never addressable by a bare column name
 * to begin with, so this doesn't newly regress or fix that.
 */
function findColumnField(fields: Field[], name: string): Field | undefined {
  for (const field of fields) {
    if (field.type === 'row' || field.type === 'collapsible') {
      const found = findColumnField(field.fields, name)
      if (found) return found
      continue
    }
    if ('name' in field && field.name === name) return field
  }
  return undefined
}
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
      <div className="flex items-center justify-between mb-[calc(var(--base)*0.9)]">
        <h1>{label}</h1>
        {canCreate && (
          <Link className="btn btn--primary" href={`/admin/collections/${collectionSlug}/create`}>
            Create new
          </Link>
        )}
      </div>

      {result.docs.length === 0 ? (
        <p className="text-[var(--theme-elevation-600)]">No documents yet.</p>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.docs.map((doc) => (
                <tr key={doc.id}>
                  {columns.map((column, index) => {
                    const cell = doc[column]
                    const columnField = findColumnField(collection.fields, column)
                    const cellOverride = (columnField as { admin?: { components?: { Cell?: string } } } | undefined)?.admin?.components?.Cell
                    const formatter = resolveCellFormatter(cellOverride)
                    const text = formatter
                      ? formatter(cell, doc)
                      : cell === undefined || cell === null
                        ? ''
                        : typeof cell === 'object'
                          ? JSON.stringify(cell)
                          : String(cell)
                    return (
                      <td key={column}>
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
        </div>
      )}

      <p className="mt-[calc(var(--base)*0.6)] text-[calc(var(--base)*0.78)] text-[var(--theme-elevation-500)]">
        {result.totalDocs} total{result.totalDocs > result.docs.length ? ` (showing first ${result.docs.length})` : ''}
      </p>
    </div>
  )
}

export default ListView
