import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import {
  mapSubmissionRow,
  pageInfo,
  parseId,
  parsePage,
  RESULTS_PAGE_SIZE,
  submissionColumns,
} from '@/admin/views/results/rows'
import type { FormDoc } from '@/features/forms/types'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-form-submissions?form=<id>&page=<n>
 *   One page of that form's entries, newest first. `columns` are the form's
 *   answer fields, so the table has the same shape as the form.
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