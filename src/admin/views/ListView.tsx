import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Field } from '@/engine'
import { getAdminContext, getCollectionConfig } from '@/admin/auth'
import { resolveCellFormatter } from '@/admin/cellRegistry'
import {
  parseListSearchParams,
  deriveColumns,
  getListDefaults,
  buildFindArgs,
  resolveVisibleColumns,
  type ListState,
  type ColumnDef,
} from '@/admin/list/listQuery'
import { loadListPrefs, type ListPrefs } from '@/admin/list/listPrefs'
import { ListToolbar } from './ListToolbar'
import { formatCellValue } from '@/admin/list/cellFormatting'
import { VIEW_TABS, resolveActiveTab, type ViewTab } from '@/admin/list/viewTabs'
import { MediaGalleryView } from '@/views/media/MediaGalleryView'
import { EventsCalendarView } from '@/views/events/EventsCalendarView'

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

export async function ListView({
  collectionSlug,
  searchParams = {},
}: {
  collectionSlug: string
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()
  if (!context.permissions.collections?.[collectionSlug]?.read) {
    return <p>You don&apos;t have access to {collectionSlug}.</p>
  }

  // Parse URL search params
  const urlState = parseListSearchParams(searchParams)

  // Load saved user preferences
  const savedPrefs = await loadListPrefs(context.engine, context.user, collectionSlug)

  // Get defaults for this collection
  const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
  const defaults = getListDefaults(collectionSlug, useAsTitle, (collection.admin as { defaultColumns?: string[] } | undefined)?.defaultColumns)

  // Effective state: URL > saved pref > default
  const effectiveState: ListState = {
    q: urlState.q || '',
    sort: urlState.sort || savedPrefs.sort || defaults.sort,
    limit: urlState.limit || savedPrefs.limit || defaults.limit,
    page: urlState.page,
    cols: urlState.cols || savedPrefs.cols || null,
    view: urlState.view || savedPrefs.view || null,
    filters: urlState.filters,
  }

  // Derive all possible columns from collection fields
  const hasDrafts = Boolean((collection.versions as { drafts?: boolean } | undefined)?.drafts)
  const allColumns = deriveColumns(collection.fields, { drafts: hasDrafts, collectionSlug })

  // Resolve which columns should be visible
  const { visibleColumns, visibleNames } = resolveVisibleColumns(
    allColumns,
    effectiveState.cols,
    savedPrefs.cols,
    defaults.columns,
  )

  // Build find args for engine query
  const findArgs = buildFindArgs({
    collection: collectionSlug,
    urlParams: effectiveState,
    allColumns,
  })

  // Execute find
  const result = await context.engine.find({
    collection: collectionSlug,
    where: findArgs.where as any,
    sort: findArgs.sort,
    page: findArgs.page,
    limit: findArgs.limit,
    user: context.user,
    depth: 1,
  })

  const canCreate = context.permissions.collections?.[collectionSlug]?.create
  const label = typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug

  // Resolve view tabs and active tab
  const viewTabs = VIEW_TABS[collectionSlug as keyof typeof VIEW_TABS] || [{ view: 'list', label: 'List' }]
  const activeTab = resolveActiveTab(viewTabs, effectiveState.view)

  // Total pages calculation
  const totalPages = Math.ceil((result.totalDocs || 0) / effectiveState.limit)
  const hasPrevPage = effectiveState.page > 1
  const hasNextPage = effectiveState.page < totalPages

  return (
    <div className="list-view">
      <div className="list-header">
        <h1>{label}</h1>
        {canCreate && (
          <Link className="btn btn--primary" href={`/admin/collections/${collectionSlug}/create`}>
            Create new
          </Link>
        )}
      </div>

      <ListToolbar
        collectionSlug={collectionSlug}
        state={effectiveState}
        columns={allColumns}
        visibleNames={visibleNames}
        limit={effectiveState.limit}
        hasSavedPrefs={!!(savedPrefs.cols || savedPrefs.sort || savedPrefs.limit)}
        totalDocs={result.totalDocs || 0}
        view={activeTab.view}
      />

      {/* Active filters as chips */}
      {effectiveState.filters.length > 0 && (
        <div className="list-active-filters">
          {effectiveState.filters.map((filter, idx) => {
            const colDef = allColumns.find((c) => c.name === filter.field)
            return (
              <div key={idx} className="list-filter-chip">
                <span>
                  {colDef?.label || filter.field} {filter.op} {filter.value}
                </span>
                <button
                  onClick={async () => {
                    const newFilters = effectiveState.filters.filter((_, i) => i !== idx)
                    const search = new URLSearchParams()
                    Object.entries(effectiveState).forEach(([k, v]) => {
                      if (k === 'filters') return
                      if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return
                      if (k === 'cols' && Array.isArray(v)) search.append(k, v.join(','))
                      else if (!Array.isArray(v)) search.append(k, String(v))
                    })
                    newFilters.forEach((f) => {
                      search.append('f', `${f.field}:${f.op}:${f.value}`)
                    })
                    const url = `/admin/collections/${collectionSlug}?${search.toString()}`
                    window.location.href = url
                  }}
                  className="list-filter-chip-remove"
                  type="button"
                  aria-label="Remove filter"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* View tabs */}
      {viewTabs.length > 1 && (
        <div className="list-tabs">
          {viewTabs.map((tab) => (
            <a
              key={tab.view}
              href={`?view=${tab.view}&page=1`}
              className={`list-tab ${activeTab.view === tab.view ? 'list-tab--active' : ''}`}
            >
              {tab.label}
            </a>
          ))}
        </div>
      )}

      {/* List view (or other tab view) */}
      {activeTab.view === 'list' && (
        <>
          {result.docs.length === 0 ? (
            <p className="list-empty">No documents yet.</p>
          ) : (
            <div className="list-table-wrapper">
              <table className="list-table">
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th key={column.name} className="list-th">
                        <a
                          href={`?${new URLSearchParams({
                            ...Object.fromEntries(
                              Object.entries(effectiveState).filter(
                                ([k]) => k !== 'sort' && k !== 'page'
                              ) as [string, any][]
                            ),
                            sort: effectiveState.sort === column.name
                              ? `-${column.name}`
                              : effectiveState.sort === `-${column.name}`
                                ? ''
                                : column.name,
                            page: '1',
                          })}`}
                          className="list-sort-link"
                        >
                          {column.label}
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.docs.map((doc) => (
                    <tr key={doc.id} className="list-row">
                      {visibleColumns.map((column, index) => {
                        const cell = (doc as Record<string, unknown>)[column.name]
                        const columnField = findColumnField(collection.fields, column.name)
                        const cellOverride = (columnField as { admin?: { components?: { Cell?: string } } } | undefined)?.admin?.components?.Cell
                        const formatter = resolveCellFormatter(cellOverride)
                        const text = formatCellValue(cell, doc, columnField, formatter)

                        // Handle thumbnail column specially
                        if (column.name === 'thumbnail' && column.type === 'thumbnail') {
                          const thumbUrl = doc.url
                          if (typeof thumbUrl === 'string' && String(doc.mimeType ?? '').startsWith('image/')) {
                            return (
                              <td key={column.name} className="list-td">
                                <img
                                  src={thumbUrl}
                                  alt=""
                                  loading="lazy"
                                  style={{ height: '50px', width: '50px', objectFit: 'cover', borderRadius: '4px' }}
                                />
                              </td>
                            )
                          }
                          return <td key={column.name} className="list-td" />
                        }

                        return (
                          <td key={column.name} className="list-td">
                            {index === 0 ? (
                              <Link href={`/admin/collections/${collectionSlug}/${doc.id}`} className="list-link">
                                {text || `#${doc.id}`}
                              </Link>
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="list-pagination">
              {hasPrevPage && (
                <a
                  href={`?${new URLSearchParams({
                    ...Object.fromEntries(
                      Object.entries(effectiveState).filter(
                        ([k]) => k !== 'page'
                      ) as [string, any][]
                    ),
                    page: String(effectiveState.page - 1),
                  })}`}
                  className="list-pagination-btn"
                >
                  Prev
                </a>
              )}
              <span className="list-pagination-info">
                Page {effectiveState.page} of {totalPages}
              </span>
              {hasNextPage && (
                <a
                  href={`?${new URLSearchParams({
                    ...Object.fromEntries(
                      Object.entries(effectiveState).filter(
                        ([k]) => k !== 'page'
                      ) as [string, any][]
                    ),
                    page: String(effectiveState.page + 1),
                  })}`}
                  className="list-pagination-btn"
                >
                  Next
                </a>
              )}
              <span className="list-pagination-total">
                Total: {result.totalDocs}
              </span>
            </div>
          )}
        </>
      )}

      {/* Gallery view for media */}
      {activeTab.view === 'gallery' && (
        <MediaGalleryView
          collectionConfig={{ slug: collectionSlug }}
          data={{ docs: result.docs, totalDocs: result.totalDocs, page: effectiveState.page }}
          hasCreatePermission={canCreate}
          newDocumentURL={`/admin/collections/${collectionSlug}/create`}
          engine={context.engine}
          searchParams={{ ...searchParams, view: 'gallery' }}
          embedded={true}
        />
      )}

      {/* Calendar view for events */}
      {activeTab.view === 'calendar' && (
        <EventsCalendarView
          collectionConfig={{ slug: collectionSlug }}
          data={{ docs: result.docs, totalDocs: result.totalDocs, page: effectiveState.page }}
          hasCreatePermission={canCreate}
          newDocumentURL={`/admin/collections/${collectionSlug}/create`}
          engine={context.engine}
          searchParams={{ ...searchParams, view: 'calendar' }}
          user={context.user}
          embedded={true}
        />
      )}
    </div>
  )
}

export default ListView
