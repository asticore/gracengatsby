import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { adminCollectionPath } from '@/admin/adminPaths'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { formatDateCell } from '@/admin/list/dateFormatter'
import { loadListPrefs } from '@/admin/list/listPrefs'
import { parseListSearchParams, resolveVisibleColumns, serializeListState, type ListState } from '@/admin/list/listQuery'
import { computeTemplateCoverage, type CoverageTemplate } from '@/features/siteTemplates/coverage'
import { StatusSwitch } from '@/features/templatesHub/admin/StatusSwitch'
import { SuggestedTemplates, type SuggestionWarning } from '@/features/templatesHub/admin/SuggestedTemplates'
import {
  HUB_COLUMNS,
  HUB_DEFAULT_COLUMNS,
  HUB_DEFAULT_SORT,
  buildHubRows,
  filterHubRows,
  pageHubRows,
  sortHubRows,
  type HubCollection,
  type HubRow,
  type HubSourceDoc,
} from '@/features/templatesHub/rows'
import { ListToolbar } from './ListToolbar'

const HUB_READ_LIMIT = 1000
const libraryLink = '/admin/settings/template-libraries'

/** Reads one collection for the hub at depth 0, or null when the admin cannot read it. */
async function readCollection(
  context: Awaited<ReturnType<typeof getAdminContext>>,
  collection: HubCollection,
): Promise<HubSourceDoc[] | null> {
  if (!context.permissions.collections?.[collection]?.read) return null
  const result = await context.engine.find({ collection, depth: 0, limit: HUB_READ_LIMIT, user: context.user })
  return (result.docs ?? []) as unknown as HubSourceDoc[]
}

/** Sort link for a column: ascending, then descending, then off. Same cycle as the Pages list. */
function nextSort(state: ListState, column: string): string {
  if (state.sort === column) return `-${column}`
  if (state.sort === `-${column}`) return ''
  return column
}

function cellFor(column: string, row: HubRow): ReactNode {
  switch (column) {
    case 'name':
      return (
        <Link className="list-link" href={row.editHref}>
          {row.name}
        </Link>
      )
    case 'type':
      return row.typeLabel
    case 'status':
      return row.toggleable ? <StatusSwitch id={row.id} name={row.name} on={row.status === 'on'} /> : row.statusLabel
    case 'where':
      return row.where
    case 'priority':
      return row.priority === null ? '-' : String(row.priority)
    case 'updatedAt':
      return formatDateCell(row.updatedAt)
    default:
      return ''
  }
}

/**
 * Templates hub (admin/templates): one table of site templates, page templates and reusable sections, with the
 * same search, column choice, filters, sort and paging as the Pages list. Below it: suggested missing site templates.
 * Rows are built and filtered by the pure functions in @/features/templatesHub/rows.
 */
export async function TemplatesHubView({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')

  const [siteDocs, pageDocs, sectionDocs] = await Promise.all([
    readCollection(context, 'site-templates'),
    readCollection(context, 'page-templates'),
    readCollection(context, 'reusable-sections'),
  ])

  // Prefs are saved under the site-templates key: the hub is that collection's home now (its list URL redirects here).
  const savedPrefs = await loadListPrefs(context.engine, context.user, 'site-templates')
  const urlState = parseListSearchParams(searchParams)
  const state: ListState = {
    ...urlState,
    sort: urlState.sort || savedPrefs.sort || HUB_DEFAULT_SORT,
    limit: urlState.limit || savedPrefs.limit || 25,
    cols: urlState.cols || savedPrefs.cols || null,
    view: null,
  }

  const { visibleColumns, visibleNames } = resolveVisibleColumns(HUB_COLUMNS, state.cols, savedPrefs.cols, HUB_DEFAULT_COLUMNS)
  const allRows = buildHubRows({ siteTemplates: siteDocs ?? [], pageTemplates: pageDocs ?? [], reusableSections: sectionDocs ?? [] })
  const matching = sortHubRows(filterHubRows(allRows, state.filters, state.q), state.sort)
  const paged = pageHubRows(matching, state.page, state.limit)

  const warnings: SuggestionWarning[] = siteDocs
    ? computeTemplateCoverage(siteDocs as unknown as CoverageTemplate[]).map((w) => ({ code: w.code, kind: w.kind, message: w.message }))
    : []

  const canCreate = (slug: HubCollection) => Boolean(context.permissions.collections?.[slug]?.create)
  const hasAnyRows = allRows.length > 0

  return (
    <div className="list-view">
      <div className="list-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h1>Templates</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canCreate('page-templates') ? (
            <Link className="btn" href={`${adminCollectionPath('page-templates')}/create`}>New page template</Link>
          ) : null}
          {canCreate('reusable-sections') ? (
            <Link className="btn" href={`${adminCollectionPath('reusable-sections')}/create`}>New reusable section</Link>
          ) : null}
          <Link className="btn" href={libraryLink}>Template libraries</Link>
        </div>
      </div>

      {siteDocs === null ? <p role="status">You do not have access to site templates, so they are not listed.</p> : null}

      <div className="lst-panel">
        <ListToolbar
          collectionSlug="site-templates"
          state={state}
          columns={HUB_COLUMNS}
          visibleNames={visibleNames}
          limit={state.limit}
          hasSavedPrefs={!!(savedPrefs.cols || savedPrefs.sort || savedPrefs.limit)}
          totalDocs={matching.length}
          view="list"
        />

        {state.filters.length > 0 && (
          <div className="list-active-filters">
            {state.filters.map((filter, idx) => (
              <div key={idx} className="list-filter-chip">
                <span>
                  {HUB_COLUMNS.find((c) => c.name === filter.field)?.label || filter.field} {filter.op} {filter.value}
                </span>
                <a
                  href={`?${serializeListState(state, { filters: state.filters.filter((_, i) => i !== idx), page: 1 })}`}
                  className="list-filter-chip-remove"
                  aria-label="Remove filter"
                >
                  ×
                </a>
              </div>
            ))}
          </div>
        )}

        {!hasAnyRows ? (
          <p className="list-empty">No templates yet. Create a site template from the suggestions below, or add a page template or reusable section.</p>
        ) : matching.length === 0 ? (
          <p className="list-empty">No templates match this search or filter.</p>
        ) : (
          <div className="list-table-wrapper">
            <table className="list-table">
              <thead>
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column.name} className="list-th">
                      {column.sortable ? (
                        <a className="list-sort-link" href={`?${serializeListState(state, { sort: nextSort(state, column.name), page: 1 })}`}>
                          {column.label}
                        </a>
                      ) : (
                        column.label
                      )}
                    </th>
                  ))}
                  <th className="list-th">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((row) => (
                  <tr key={row.key} className="list-row">
                    {visibleColumns.map((column) => (
                      <td key={column.name} className="list-td">
                        {cellFor(column.name, row)}
                      </td>
                    ))}
                    <td className="list-td" style={{ whiteSpace: 'nowrap' }}>
                      <Link className="list-link" href={row.editHref}>Edit</Link>
                      {row.visualHref ? <> · <Link className="list-link" href={row.visualHref}>Visual builder</Link></> : null}
                      {row.previewHref ? <> · <a className="list-link" href={row.previewHref} target="_blank" rel="noopener noreferrer">Preview</a></> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {paged.totalPages > 1 && (
          <div className="list-pagination">
            {paged.page > 1 && (
              <a className="list-pagination-btn" href={`?${serializeListState(state, { page: paged.page - 1 })}`}>Prev</a>
            )}
            <span className="list-pagination-info">Page {paged.page} of {paged.totalPages}</span>
            {paged.page < paged.totalPages && (
              <a className="list-pagination-btn" href={`?${serializeListState(state, { page: paged.page + 1 })}`}>Next</a>
            )}
            <span className="list-pagination-total">Total: {matching.length}</span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <SuggestedTemplates warnings={warnings} showCoverageOk={siteDocs !== null} />
      </div>
    </div>
  )
}

export default TemplatesHubView
