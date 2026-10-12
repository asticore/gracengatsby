import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { collectRows, type FindEngine } from '@/admin/views/results/collectRows'
import {
  allCsvFilename,
  restrictToIds,
  buildAllSubmissionsCsv,
  buildSubmissionsWhere,
  mapAllSubmissionRow,
  mapSubmissionRow,
  pageInfo,
  parseId,
  parsePage,
  parseSearch,
  RESULTS_PAGE_SIZE,
  submissionColumns,
} from '@/admin/views/results/rows'
import type { FormDoc } from '@/features/forms/types'

/** The across-every-form CSV stops here. */
const CSV_MAX_ROWS = 5000

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-form-submissions?form=<id>&page=<n>
 *   One page of that form's entries, newest first. `columns` are the form's
 *   answer fields, so the table has the same shape as the form.
 *
 * GET /api/admin-form-submissions?all=1[&form=<id>][&status=none|unpaid|paid][&q=<text>]
 *     [&from=YYYY-MM-DD][&to=YYYY-MM-DD][&page=<n>][&format=csv]
 *   Entries of every form (the Submissions tab on the Forms list page), newest first, with the
 *   form's title on each row. `q` searches the entry summary (the first few answers).
 *   `format=csv` downloads the filtered rows (summary only; the per-form export has every answer).
 *
 * The CSV for a form is the existing /api/form-submissions/export?form=<id>.
 * This route is the on-screen list only.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!context.permissions.collections?.['form-submissions']?.read) return json({ error: 'Forbidden' }, 403)

    const url = new URL(request.url)

    if (url.searchParams.get('all') === '1') {
      let where = buildSubmissionsWhere({
        form: parseId(url.searchParams.get('form')),
        status: url.searchParams.get('status'),
        q: parseSearch(url.searchParams.get('q')),
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
      })
      if (!context.isAdmin) {
        // Only rows of forms this user can read (own-scope aware).
        const visible = await context.engine.find({ collection: 'forms', depth: 0, limit: 1000, pagination: false, user: context.user } as never)
        where = restrictToIds(where, 'form', (visible.docs as Array<{ id: number | string }>).map((d) => d.id))
      }
      if (url.searchParams.get('format') === 'csv') {
        const { docs, truncated } = await collectRows(
          context.engine as unknown as FindEngine,
          { collection: 'form-submissions', where, sort: '-createdAt', depth: 1, user: context.user },
          CSV_MAX_ROWS,
        )
        return new Response(`﻿${buildAllSubmissionsCsv(docs.map(mapAllSubmissionRow))}`, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${allCsvFilename('submissions')}"`,
            'Cache-Control': 'no-store',
            ...(truncated ? { 'X-Export-Truncated': 'true' } : {}),
          },
        })
      }
      const allPage = parsePage(url.searchParams.get('page'))
      const found = await context.engine.find({
        collection: 'form-submissions',
        where: where as never,
        sort: '-createdAt',
        page: allPage,
        limit: RESULTS_PAGE_SIZE,
        depth: 1,
        user: context.user,
      })
      return json({
        ...pageInfo(allPage, RESULTS_PAGE_SIZE, found.totalDocs),
        docs: (found.docs as Record<string, unknown>[]).map(mapAllSubmissionRow),
      })
    }

    const formId = parseId(url.searchParams.get('form'))
    if (formId === null) return json({ error: 'Add ?form=<id> to choose a form.' }, 400)

    const form = (await context.engine
      .findByID({ collection: 'forms', id: formId, depth: 0, user: context.user })
      .catch((): null => null)) as FormDoc | null
    if (!form) return json({ error: 'That form does not exist.' }, 404)

    const columns = submissionColumns(form)
    const page = parsePage(url.searchParams.get('page'))
    const result = await context.engine.find({
      collection: 'form-submissions',
      where: { form: { equals: formId } },
      sort: '-createdAt',
      page,
      limit: RESULTS_PAGE_SIZE,
      depth: 0,
      user: context.user,
    })

    return json({
      ...pageInfo(page, RESULTS_PAGE_SIZE, result.totalDocs),
      columns,
      docs: (result.docs as Record<string, unknown>[]).map((doc) => mapSubmissionRow(doc, columns)),
    })
  } catch (error) {
    console.error('admin-form-submissions GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
