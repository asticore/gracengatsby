import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { collectRows, type FindEngine } from '@/admin/views/results/collectRows'
import {
  allCsvFilename,
  restrictToIds,
  buildAllRsvpsCsv,
  buildRsvpCsv,
  buildRsvpsWhere,
  mapAllRsvpRow,
  mapRsvpRow,
  pageInfo,
  parseId,
  parsePage,
  parseSearch,
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
 * GET /api/admin-event-rsvps?all=1[&event=<id>][&q=<text>][&from=YYYY-MM-DD][&to=YYYY-MM-DD][&page=<n>][&format=csv]
 *   The RSVPs of every event (the RSVPs tab on the Events list page), newest first, with the event's
 *   title on each row. `event` narrows it to one event, `q` searches name and email, `from` and `to`
 *   bound the day it was sent.
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

    if (url.searchParams.get('all') === '1') {
      let where = buildRsvpsWhere({
        event: parseId(url.searchParams.get('event')),
        q: parseSearch(url.searchParams.get('q')),
        from: url.searchParams.get('from'),
        to: url.searchParams.get('to'),
      })
      if (!context.isAdmin) {
        // Only rows of events this user can read (own-scope aware).
        const visible = await context.engine.find({ collection: 'events', depth: 0, limit: 1000, pagination: false, user: context.user } as never)
        where = restrictToIds(where, 'event', (visible.docs as Array<{ id: number | string }>).map((d) => d.id))
      }
      const allEngine = context.engine as unknown as FindEngine

      if (url.searchParams.get('format') === 'csv') {
        const { docs, truncated } = await collectRows(
          allEngine,
          { collection: 'event-rsvps', where, sort: '-createdAt', depth: 1, user: context.user },
          CSV_MAX_ROWS,
        )
        const csv = `﻿${buildAllRsvpsCsv(docs.map(mapAllRsvpRow))}`
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${allCsvFilename('rsvps')}"`,
            'Cache-Control': 'no-store',
            ...(truncated ? { 'X-Export-Truncated': 'true' } : {}),
          },
        })
      }

      const allPage = parsePage(url.searchParams.get('page'))
      const found = await context.engine.find({
        collection: 'event-rsvps',
        where: where as never,
        sort: '-createdAt',
        page: allPage,
        limit: RESULTS_PAGE_SIZE,
        depth: 1,
        user: context.user,
      })
      return json({
        ...pageInfo(allPage, RESULTS_PAGE_SIZE, found.totalDocs),
        docs: (found.docs as Record<string, unknown>[]).map(mapAllRsvpRow),
      })
    }

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
