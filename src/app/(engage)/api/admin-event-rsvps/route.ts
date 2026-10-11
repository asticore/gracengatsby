import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { collectRows, type FindEngine } from '@/admin/views/results/collectRows'
import {
  buildRsvpCsv,
  mapRsvpRow,
  pageInfo,
  parseId,
  parsePage,
  RESULTS_PAGE_SIZE,
  rsvpCsvFilename,
  sumGuests,
} from '@/admin/views/results/rows'

export const dynamic = 'force-dynamic'

/** The CSV stops here. A larger export wants a streamed response, not a longer loop. */
const CSV_MAX_ROWS = 5000
/** Guests are summed across every RSVP up to this ceiling; past it the total is marked as a floor. */
const GUEST_SCAN_MAX_ROWS = 10000

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-event-rsvps?event=<id>&page=<n>
 *   JSON: one page of that event's RSVPs (newest first) plus totals.
 * GET /api/admin-event-rsvps?event=<id>&format=csv
 *   The RSVPs as a spreadsheet, oldest first so a re-export appends.
 *
 * Admin panel access is required, and so is either admin or update permission on events: the
 * list is the whole event's RSVPs, so someone who only owns one RSVP is refused. The event-rsvps
 * read permission is required too. The reads pass the signed-in user, so the collection's own
 * access rule still applies on top of the permission check.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!context.isAdmin && !context.permissions.collections?.events?.update) return json({ error: 'Forbidden' }, 403)
    if (!context.permissions.collections?.['event-rsvps']?.read) return json({ error: 'Forbidden' }, 403)

    const url = new URL(request.url)
    const eventId = parseId(url.searchParams.get('event'))
    if (eventId === null) return json({ error: 'Add ?event=<id> to choose an event.' }, 400)

    const engine = context.engine as unknown as FindEngine
    const event = (await context.engine
      .findByID({ collection: 'events', id: eventId, depth: 0, user: context.user })
      .catch((): null => null)) as Record<string, unknown> | null
    if (!event) return json({ error: 'That event does not exist.' }, 404)

    const where = { event: { equals: eventId } }

    if (url.searchParams.get('format') === 'csv') {
      const { docs, truncated } = await collectRows(
        engine,
        { collection: 'event-rsvps', where, sort: 'createdAt', depth: 0, user: context.user },
        CSV_MAX_ROWS,
      )
      const csv = `﻿${buildRsvpCsv(docs.map(mapRsvpRow))}`
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${rsvpCsvFilename(typeof event.title === 'string' ? event.title : '')}"`,
          'Cache-Control': 'no-store',
          ...(truncated ? { 'X-Export-Truncated': 'true' } : {}),
        },
      })
    }

    const page = parsePage(url.searchParams.get('page'))
    const result = await context.engine.find({
      collection: 'event-rsvps',
      where,
      sort: '-createdAt',
      page,
      limit: RESULTS_PAGE_SIZE,
      depth: 0,
      user: context.user,
    })

    const { docs: everyRsvp, truncated } = await collectRows(
      engine,
      { collection: 'event-rsvps', where, sort: 'createdAt', depth: 0, user: context.user },
      GUEST_SCAN_MAX_ROWS,
    )

    return json({
      ...pageInfo(page, RESULTS_PAGE_SIZE, result.totalDocs),
      docs: (result.docs as Record<string, unknown>[]).map(mapRsvpRow),
      totalGuests: sumGuests(everyRsvp.map(mapRsvpRow)),
      guestsTruncated: truncated,
    })
  } catch (error) {
    console.error('admin-event-rsvps GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
