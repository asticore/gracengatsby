import type { Endpoint, EngineRequest } from '@/engine'

import type { FormDoc } from './types'

import { buildCsv, csvFilename, type ExportRow } from './csv'
import { FORMS_SLUG, SUBMISSIONS_SLUG } from './slugs'

/**
 * GET /api/form-submissions/export?form=<id>
 *
 * Admin-only, because an export is every answer every visitor has ever given -
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

const PAGE_SIZE = 500
const MAX_ROWS = 50_000

export const exportEndpoint: Endpoint = {
  path: '/export',
  method: 'get',
  handler: async (req: EngineRequest): Promise<Response> => {
    const roles = (req.user as { roles?: string[] } | null)?.roles || []
    if (!roles.includes('admin')) {
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

    const engine = req.payload

    const form = (await engine
      .findByID({ collection: FORMS_SLUG, id: formID, depth: 0 })
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
        where: { form: { equals: formID } },
        // Oldest first so a re-export appends rather than reshuffling, which
        // matters to anyone diffing two exports.
        sort: 'createdAt',
        depth: 0,
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
