import { adminCollectionPath } from '@/admin/adminPaths'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Field } from '@/engine'
import { getAdminContext, getCollectionConfig, hasAdminPanelAccess } from '@/admin/auth'
import { resolveCellFormatter } from '@/admin/cellRegistry'
import {
  parseListSearchParams,
  deriveColumns,
  getListDefaults,
  buildFindArgs,
  serializeListState,
  resolveVisibleColumns,
  type ListState,
  type ColumnDef,
} from '@/admin/list/listQuery'
import { loadListPrefs, type ListPrefs } from '@/admin/list/listPrefs'
import { ListToolbar } from './ListToolbar'
import { formatCellValue } from '@/admin/list/cellFormatting'
import { SECTION_PANEL_ID, VIEW_TABS, resolveActiveTab, resolveSectionTab, resolveSectionTabs, sectionTabId, type ViewTab } from '@/admin/list/viewTabs'
import { ListSectionTabs } from './ListSectionTabs'
import { resolveComponent } from '@/admin/componentRegistry'
import { AllSubmissionsTab } from './results/AllSubmissionsTab'
import { AllRsvpsTab } from './results/AllRsvpsTab'
import { ABResultsOverview } from './results/ABResultsOverview'
import { MediaGalleryView } from '@/views/media/MediaGalleryView'
import { EventsCalendarView } from '@/views/events/EventsCalendarView'
import { PagesTreeView } from './PagesTreeView'
import { breadcrumbTitle } from '@/features/pagesTree/breadcrumb'
import { ListRowActions } from './ListRowActions'
import { getSecuritySettings } from '@/features/security/settings'
import { shouldShowRowActions } from '@/admin/list/quickEdit'
import { PageSpeedBadge } from '@/features/pagespeed/ui/PageSpeedBadge'
import { orderNameSearchBranches } from '@/features/ecommerce/server/orderSearch'
import { BulkActionsBar } from '@/features/editScreens/admin/BulkActionsBar'
import { getAdminUi } from '@/admin/i18n/serverUi'
import { actionRefusal } from '@/features/editScreens/bulk'
import { bulkPermissions, isBulkCollection } from '@/features/editScreens/authors'
import '@/features/editScreens/admin/edit-screens.css'

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
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

  const collection = getCollectionConfig(context.engine, collectionSlug)
  if (!collection) notFound()
  if (!context.permissions.collections?.[collectionSlug]?.read) {
    return <p>You don&apos;t have access to {collectionSlug}.</p>
  }

  // Section tabs (Forms | Submissions, Events | RSVPs, Tests | Results): the tab bar sits above everything.
  const sectionTabs = resolveSectionTabs(collectionSlug, {
    isAdmin: context.isAdmin,
    canRead: (slug) => Boolean(context.permissions.collections?.[slug]?.read),
    canUpdate: (slug) => Boolean(context.permissions.collections?.[slug]?.update),
  })
  const requestedTab = typeof searchParams.tab === 'string' ? searchParams.tab : null
  const activeSection = sectionTabs.length > 0 ? resolveSectionTab(sectionTabs, requestedTab) : null
  const sectionLabel = typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug
  const tabBar = activeSection ? (
    <ListSectionTabs
      activeKey={activeSection.key}
      label={`${sectionLabel} sections`}
      tabs={sectionTabs.map((tab) => ({ key: tab.key, label: tab.label, allowed: tab.allowed, primary: tab.primary, deniedReason: tab.deniedReason }))}
    />
  ) : null

  if (activeSection && !activeSection.primary) {
    let panel: ReactNode
    if (!activeSection.allowed) {
      panel = <p className="lst-denied" role="status">{activeSection.deniedReason}</p>
    } else if (collectionSlug === 'forms') {
      const forms = await context.engine.find({ collection: 'forms', depth: 0, limit: 200, sort: 'title', user: context.user }).catch(() => ({ docs: [] as unknown[] }))
      panel = <AllSubmissionsTab forms={forms.docs.map((doc) => ({ id: (doc as { id: number }).id, title: String((doc as { title?: unknown }).title ?? `Form #${(doc as { id: number }).id}`) }))} />
    } else if (collectionSlug === 'events') {
      const events = await context.engine.find({ collection: 'events', depth: 0, limit: 200, sort: '-startDate', user: context.user }).catch(() => ({ docs: [] as unknown[] }))
      panel = <AllRsvpsTab events={events.docs.map((doc) => ({ id: (doc as { id: number }).id, title: String((doc as { title?: unknown }).title ?? `Event #${(doc as { id: number }).id}`) }))} />
    } else {
      panel = <ABResultsOverview engine={context.engine} user={context.user} />
    }
    return (
      <div className="list-view">
        <div className="list-header">
          <h1>{sectionLabel}</h1>
        </div>
        {tabBar}

        <div aria-labelledby={sectionTabId(activeSection.key)} className="lst-panel" id={SECTION_PANEL_ID} role="tabpanel">
          {panel}
        </div>
      </div>
    )
  }

  // Parse URL search params
  const ui = await getAdminUi()
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

  // Build find args for engine query (orders also match a customer's name in the search box)
  const extraSearch = collectionSlug === 'orders' && effectiveState.q ? await orderNameSearchBranches(effectiveState.q) : []
  const findArgs = buildFindArgs({
    collection: collectionSlug,
    urlParams: effectiveState,
    allColumns,
    extraSearch,
  })

  // Trash (pages, posts, events): the list hides trashed items; ?trash=1 shows only them.
  const bulkCollection = isBulkCollection(collectionSlug) ? collectionSlug : null
  const trashView = bulkCollection !== null && searchParams.trash === '1'
  const trashClause = bulkCollection ? { trashedAt: { exists: trashView } } : null
  const listWhere = trashClause ? (findArgs.where ? { and: [findArgs.where, trashClause] } : trashClause) : findArgs.where
  const trashCount = bulkCollection
    ? await context.engine.count({ collection: collectionSlug, where: { trashedAt: { exists: true } } as any, user: context.user }).then((r) => r.totalDocs).catch(() => 0)
    : 0

  // Execute find
  const result = await context.engine.find({
    collection: collectionSlug,
    where: listWhere as any,
    sort: findArgs.sort,
    page: findArgs.page,
    limit: findArgs.limit,
    user: context.user,
    depth: 1,
  })

  // For pages collection, fetch parent info for breadcrumb titles
  const parentsByPageId: Record<number | string, { title?: string; parent?: number | string | null } | undefined> = {}
  if (collectionSlug === 'pages' && visibleColumns.some((c) => c.name === 'title')) {
    const pageIds = result.docs
      .map((doc) => (doc as any)?.id)
      .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string')

    if (pageIds.length > 0) {
      try {
        const parentPages = await context.engine.find({
          collection: 'pages',
          where: {} as any,
          user: context.user,
          depth: 0,
          limit: 1000,
        })
        for (const page of parentPages.docs || []) {
          const p = page as any
          parentsByPageId[p.id] = { title: p.title, parent: p.parent }
        }
      } catch (err) {
        console.error('Error fetching page parents for breadcrumbs:', err)
      }
    }
  }

  const canCreate = context.permissions.collections?.[collectionSlug]?.create
  const canUpdate = context.permissions.collections?.[collectionSlug]?.update
  const showRowActions = shouldShowRowActions(collectionSlug, hasDrafts)
  // "Sign in as" on customer rows of the Users list, for admins, when the feature is switched on.
  const signInAsMaxMinutes =
    collectionSlug === 'users' && context.isAdmin
      ? await getSecuritySettings(context.engine).then((s) => (s.impersonation.enabled ? s.impersonation.maxMinutes : null))
      : null
  const showActionsCell = showRowActions || signInAsMaxMinutes !== null
  const label = typeof collection.labels?.plural === 'string' ? collection.labels.plural : collectionSlug

  const bulkPerms = bulkCollection ? bulkPermissions(context as never, bulkCollection) : null
  const showBulk = bulkPerms !== null && (bulkPerms.update || bulkPerms.publish || bulkPerms.delete)
  const trashQs: Record<string, string> = trashView ? { trash: '1' } : {}

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
          <Link className="btn btn--primary" href={`${adminCollectionPath(collectionSlug)}/create`}>
            Create new
          </Link>
        )}
      </div>

      {tabBar}

      {/* Collection-specific panels declared as admin.components.beforeList (registry paths), e.g. site-templates Starters. */}
      {(Array.isArray(collection.admin?.components?.beforeList) ? (collection.admin.components.beforeList as string[]) : []).map((path) => {
        const Panel = resolveComponent(path)
        return Panel ? <Panel key={path} /> : null
      })}

      <div
        aria-labelledby={activeSection ? sectionTabId(activeSection.key) : undefined}
        className="lst-panel"
        id={activeSection ? SECTION_PANEL_ID : undefined}
        role={activeSection ? 'tabpanel' : undefined}
      >
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
                <a
                  href={`${adminCollectionPath(collectionSlug)}?${serializeListState(effectiveState, {
                    filters: effectiveState.filters.filter((_, i) => i !== idx),
                  })}`}
                  className="list-filter-chip-remove"
                  aria-label={ui.t('list.removeFilter')}
                >
                  ×
                </a>
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

      {/* Trash (pages, posts, events) */}
      {bulkCollection && activeTab.view === 'list' && (
        <nav aria-label="Trash" className="es-trash-links">
          <a aria-current={!trashView ? 'true' : undefined} href={`${adminCollectionPath(collectionSlug)}`}>
            All
          </a>
          <a aria-current={trashView ? 'true' : undefined} href={`${adminCollectionPath(collectionSlug)}?trash=1`}>
            Trash ({trashCount})
          </a>
        </nav>
      )}

      {/* List view (or other tab view) */}
      {activeTab.view === 'list' && (
        <>
          {showBulk && bulkCollection && bulkPerms && (
            <BulkActionsBar
              canChangeAuthor={actionRefusal('changeAuthor', bulkPerms) === null}
              canDelete={bulkPerms.delete}
              canPublish={bulkPerms.publish}
              collection={bulkCollection}
              noun={bulkCollection.slice(0, -1)}
              trashView={trashView}
            />
          )}
          {result.docs.length === 0 ? (
            <p className="list-empty">{trashView ? ui.t('list.trashEmpty') : ui.t('list.empty')}</p>
          ) : (
            <div className="list-table-wrapper">
              <table className="list-table">
                <thead>
                  <tr>
                    {showBulk && (
                      <th className="list-th es-check" scope="col">
                        <input aria-label={ui.t('list.selectAllPage')} data-bulk-all type="checkbox" />
                      </th>
                    )}
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
                            ...trashQs,
                          })}`}
                          className="list-sort-link"
                        >
                          {column.label}
                        </a>
                      </th>
                    ))}
                    {showActionsCell && (
                      <th key="actions" className="list-th">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.docs.map((doc) => (
                    <tr key={doc.id} className="list-row">
                      {showBulk && (
                        <td className="list-td es-check">
                          <input
                            aria-label={ui.t('list.selectRow', { title: String((doc as Record<string, unknown>)[useAsTitle ?? 'title'] ?? `#${doc.id}`) })}
                            data-bulk-label={String((doc as Record<string, unknown>)[useAsTitle ?? 'title'] ?? `#${doc.id}`)}
                            data-bulk-row
                            type="checkbox"
                            value={String(doc.id)}
                          />
                        </td>
                      )}
                      {visibleColumns.map((column, index) => {
                        const cell = (doc as Record<string, unknown>)[column.name]
                        const columnField = findColumnField(collection.fields, column.name)
                        const cellOverride = (columnField as { admin?: { components?: { Cell?: string } } } | undefined)?.admin?.components?.Cell
                        const formatter = resolveCellFormatter(cellOverride)
                        let text = formatCellValue(cell, doc, columnField, formatter)

                        // For pages list title column with depth > 0, show breadcrumb
                        if (collectionSlug === 'pages' && column.name === 'title' && index === 0) {
                          const docDepth = (doc as any)?.depth
                          if (docDepth && docDepth > 0) {
                            const breadcrumb = breadcrumbTitle(
                              {
                                id: (doc as any).id,
                                title: (doc as any).title,
                                parent: (doc as any).parent,
                              },
                              parentsByPageId,
                            )
                            text = breadcrumb || text
                          }
                        }

                        if (column.name === 'pagespeedScore') {
                          return (
                            <td key={column.name} className="list-td">
                              <PageSpeedBadge score={cell} testedAt={(doc as Record<string, unknown>).pagespeedAt} />
                            </td>
                          )
                        }

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
                              <Link href={`${adminCollectionPath(collectionSlug)}/${doc.id}`} className="list-link">
                                {text || `#${doc.id}`}
                              </Link>
                            ) : (
                              text
                            )}
                          </td>
                        )
                      })}
                      {showActionsCell && (
                        <td key="actions" className="list-td">
                          <ListRowActions
                            collectionSlug={collectionSlug}
                            doc={doc as Record<string, unknown>}
                            hasDrafts={hasDrafts}
                            canDuplicate={showRowActions && canCreate}
                            canUpdate={showRowActions && canUpdate}
                            signInAs={signInAsMaxMinutes !== null ? { maxMinutes: signInAsMaxMinutes, admin: { id: (context.user as { id?: unknown } | null)?.id } } : undefined}
                          />
                        </td>
                      )}
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
                    ...trashQs,
                  })}`}
                  className="list-pagination-btn"
                >
                  {ui.t('list.previous')}
                </a>
              )}
              <span className="list-pagination-info">
                {ui.t('list.pageOf', { page: effectiveState.page, total: totalPages })}
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
                    ...trashQs,
                  })}`}
                  className="list-pagination-btn"
                >
                  {ui.t('list.next')}
                </a>
              )}
              <span className="list-pagination-total">
                {ui.t('list.total', { total: result.totalDocs })}
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
          newDocumentURL={`${adminCollectionPath(collectionSlug)}/create`}
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
          newDocumentURL={`${adminCollectionPath(collectionSlug)}/create`}
          engine={context.engine}
          searchParams={{ ...searchParams, view: 'calendar' }}
          user={context.user}
          embedded={true}
        />
      )}

      {/* Tree view for pages */}
      {activeTab.view === 'tree' && (
        <PagesTreeView
          engine={context.engine}
          hasCreatePermission={canCreate}
          newDocumentURL={`${adminCollectionPath(collectionSlug)}/create`}
          searchParams={searchParams}
        />
      )}
      </div>
    </div>
  )
}

export default ListView
