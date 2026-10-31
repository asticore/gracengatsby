import type { Endpoint, EngineRequest } from '@/engine'

import type { FormDoc } from './types'

import { can, resolveAccess } from '@/features/roles/permissions'

import { buildCsv, csvFilename, type ExportRow } from './csv'
import { FORMS_SLUG, SUBMISSIONS_SLUG } from './slugs'
import { parseSubmissionFilters, submissionsWhere } from './submissionsApi'

/**
 * GET /api/form-submissions/export?form=<id>[&status=..&assignee=..&from=..&to=..&q=..]
 *
 * Administrators, and anyone a role has been granted "Form entries: download
 * CSV" (resource `forms.export`) who can also read every form entry (`form-submissions`, all
 * scope). The filters are the same ones the entries list uses (submissionsApi.ts), so an export
 * matches what was on screen.
 * Because an export is every answer every visitor has ever given -
 * names, addresses, whatever was typed into a message box - in one file. The
 * check is explicit rather than inherited from the collection's `read` access:
 * this endpoint reads with `overrideAccess` so the page loop is not filtered
 * per-row, and that only stays safe if the door is locked here.
 *
 * Paged rather than fetched in one query: a popular form accumulates tens of
 * thousands of entries and a single unbounded find would exhaust the Worker's
 * memory. The CSV is assembled page by page and returned whole, which is fine
 * up to the point where the response itself is the limit - past that this wants
 * to become a streamed response, which is a change to this function only.
 */

const assigneeName = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const user = value as { name?: string; email?: string }
  return user.name || user.email || undefined
}

const PAGE_SIZE = 500
const MAX_ROWS = 50_000

export const exportEndpoint: Endpoint = {
  path: '/export',
  method: 'get',
  handler: async (req: EngineRequest): Promise<Response> => {
    const user = req.user as Parameters<typeof can>[0] & { roles?: string[] }
    const roles = user?.roles || []
    // Both are needed. forms.export opens the download; form-submissions read (all scope, since an
    // entries export cannot be limited to the user's own rows) decides whether the entries may be
    // read at all. Without the second check, a role could export what the entries screen hides.
    const mayExport = Boolean(user) && can(user, 'forms.export', 'read') && resolveAccess(user, 'form-submissions', 'read') === 'all'
    if (!roles.includes('admin') && !mayExport) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const url = new URL((req as unknown as Request).url)
    const formID = url.searchParams.get('form')
    if (!formID) {
      return new Response(JSON.stringify({ error: 'Add ?form=<id> to choose which form to export.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const engine = req.engine

    const form = (await engine
      .findByID({ collection: FORMS_SLUG, id: formID as unknown as number, depth: 0 })
      .catch((): null => null)) as FormDoc | null

    if (!form) {
      return new Response(JSON.stringify({ error: 'That form does not exist.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const rows: ExportRow[] = []
    let page = 1

    for (;;) {
      const result = await engine.find({
        collection: SUBMISSIONS_SLUG,
        where: submissionsWhere({ ...parseSubmissionFilters(url.searchParams), form: Number(formID) || undefined }) as never,
        // Oldest first so a re-export appends rather than reshuffling, which
        // matters to anyone diffing two exports.
        sort: 'createdAt',
        depth: 1,
        limit: PAGE_SIZE,
        page,
        overrideAccess: true,
      })

      for (const doc of result.docs as unknown as Record<string, unknown>[]) {
        rows.push({
          id: doc.id as number | string,
          createdAt: (doc.submittedAt || doc.createdAt) as string,
          ip: doc.ip as string,
          total: doc.total as number,
          paymentStatus: doc.paymentStatus as string,
          status: doc.status as string | undefined,
          assignee: assigneeName(doc.assignee),
          notes: doc.notes as string | undefined,
          values: (doc.values || {}) as Record<string, unknown>,
        })
      }

      if (!result.hasNextPage || rows.length >= MAX_ROWS) break
      page += 1
    }

    // The leading BOM is what makes Excel on Windows read the file as UTF-8
    // rather than the local codepage, which otherwise mangles every accented
    // name in it.
    const csv = `﻿${buildCsv(form, rows)}`

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(form)}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
}
