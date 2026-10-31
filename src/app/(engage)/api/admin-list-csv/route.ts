import { NextResponse } from 'next/server'
import { getAdminContext, getCollectionConfig, hasAdminPanelAccess } from '@/admin/auth'
import { resolveCellFormatter } from '@/admin/cellRegistry'
import {
  buildFindArgs,
  deriveColumns,
  getListDefaults,
  parseListSearchParams,
  resolveVisibleColumns,
  type ListState,
} from '@/admin/list/listQuery'
import { loadListPrefs } from '@/admin/list/listPrefs'
import { buildListCsv, CSV_MAX_ROWS, CSV_PAGE_SIZE } from '@/admin/list/csvExport'
import { orderNameSearchBranches } from '@/features/ecommerce/server/orderSearch'
import { isBulkCollection } from '@/features/editScreens/authors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin-list-csv?collection=<slug>&<the list's own query>
 * Exports the rows the list's filters match, with the list's visible columns, as CSV. The query
 * is the same one the screen uses (search, sort, filters, columns, trash view), so the file
 * matches what the admin is looking at, except that it covers every page.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const collectionSlug = url.searchParams.get('collection') ?? ''

  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const collection = collectionSlug ? getCollectionConfig(context.engine, collectionSlug) : undefined
  if (!collection) {
    return NextResponse.json({ error: 'Unknown collection' }, { status: 404 })
  }
  if (!(context.isAdmin || context.permissions.collections?.[collectionSlug]?.read)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Same query parsing as the list screen: a repeated key (for example f=) arrives as an array.
  const sp: Record<string, string | string[] | undefined> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    sp[key] = values.length > 1 ? values : values[0]
  }
  const urlState = parseListSearchParams(sp)

  try {
    const savedPrefs = await loadListPrefs(context.engine, context.user, collectionSlug)
    const useAsTitle = (collection.admin as { useAsTitle?: string } | undefined)?.useAsTitle
    const defaults = getListDefaults(collectionSlug, useAsTitle, (collection.admin as { defaultColumns?: string[] } | undefined)?.defaultColumns)
    const effectiveState: ListState = {
      q: urlState.q || '',
      sort: urlState.sort || savedPrefs.sort || defaults.sort,
      limit: CSV_PAGE_SIZE,
      page: 1,
      cols: urlState.cols || savedPrefs.cols || null,
      view: urlState.view || savedPrefs.view || null,
      filters: urlState.filters,
    }

    const hasDrafts = Boolean((collection.versions as { drafts?: boolean } | undefined)?.drafts)
    const allColumns = deriveColumns(collection.fields, { drafts: hasDrafts, collectionSlug })
    const { visibleColumns } = resolveVisibleColumns(allColumns, effectiveState.cols, savedPrefs.cols, defaults.columns)

    const extraSearch = collectionSlug === 'orders' && effectiveState.q ? await orderNameSearchBranches(effectiveState.q) : []
    const findArgs = buildFindArgs({ collection: collectionSlug, urlParams: effectiveState, allColumns, extraSearch })

    // Trash view: the list hides trashed items unless ?trash=1, as on the screen.
    const bulkCollection = isBulkCollection(collectionSlug) ? collectionSlug : null
    const trashView = bulkCollection !== null && url.searchParams.get('trash') === '1'
    const trashClause = bulkCollection ? { trashedAt: { exists: trashView } } : null
    const where = trashClause ? (findArgs.where ? { and: [findArgs.where, trashClause] } : trashClause) : findArgs.where

    const docs: Record<string, unknown>[] = []
    let truncated = false
    for (let page = 1; ; page += 1) {
      const result = await context.engine.find({
        collection: collectionSlug,
        where: where as any,
        sort: findArgs.sort,
        page,
        limit: CSV_PAGE_SIZE,
        user: context.user,
        depth: 1,
      })
      for (const doc of result.docs) {
        if (docs.length >= CSV_MAX_ROWS) {
          truncated = true
          break
        }
        docs.push(doc as Record<string, unknown>)
      }
      if (truncated || result.docs.length < CSV_PAGE_SIZE || docs.length >= (result.totalDocs ?? 0)) break
    }

    const csv = buildListCsv({
      columns: visibleColumns,
      fields: collection.fields,
      docs,
      formatterFor: (_column, field) => {
        const override = (field as { admin?: { components?: { Cell?: string } } } | undefined)?.admin?.components?.Cell
        return resolveCellFormatter(override)
      },
    })

    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="${collectionSlug}-${date}.csv"`,
        'Cache-Control': 'private, no-store',
        ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
      },
    })
  } catch (error) {
    console.error('Failed to export list CSV:', error)
    return NextResponse.json({ error: 'Failed to export CSV' }, { status: 500 })
  }
}
