import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { collectRows, type FindEngine } from '@/admin/views/results/collectRows'
import { parseId } from '@/admin/views/results/rows'
import { adminRequestRefusal } from '@/features/forms/origin'
import { parseAttendee, parseCheckInRequest, type CheckInAttendee } from '@/features/editScreens/checkin'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

/** An event's check-in list stops here. A bigger event wants a paged list, not a longer loop. */
const CHECKIN_MAX_ROWS = 2000

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * Who may check guests in: admin panel access, and either admin or update on
 * events (the RSVPs tab rule), plus read on RSVPs. Changing a check-in also
 * needs update on RSVPs, the same permission that manages them.
 */
async function guard(mode: 'read' | 'write') {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) return { response: json({ error: 'Unauthorised' }, 401) }
  const collections = context.permissions.collections ?? {}
  if (!context.isAdmin && !collections.events?.update) return { response: json({ error: 'Forbidden' }, 403) }
  if (mode === 'read' && !collections['event-rsvps']?.read) return { response: json({ error: 'Forbidden' }, 403) }
  if (mode === 'write' && !context.isAdmin && !collections['event-rsvps']?.update) return { response: json({ error: 'Forbidden' }, 403) }
  return { context }
}

/**
 * GET /api/admin-event-checkin?event=<id>
 *   { event: { id, title }, attendees: [{ id, name, email, guestCount, checkedIn, checkedInAt }], truncated }
 *   Only the fields the check-in screen needs. Oldest RSVP first, so the list does not reorder under a volunteer.
 *
 * POST /api/admin-event-checkin  { rsvpId, checkedIn }
 *   Sets the check-in state and the time it was set. Asking for the state the RSVP is already in
 *   changes nothing and writes no audit entry, so a double tap or a retry is safe. Every real change
 *   is recorded in the audit log with the signed-in user.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const access = await guard('read')
    if (!access.context) return access.response!
    const { context } = access

    const eventId = parseId(new URL(request.url).searchParams.get('event'))
    if (eventId === null) return json({ error: 'Add ?event=<id> to choose an event.' }, 400)

    const event = (await context.engine
      .findByID({ collection: 'events', id: eventId, depth: 0, user: context.user })
      .catch((): null => null)) as Record<string, unknown> | null
    if (!event) return json({ error: 'That event does not exist.' }, 404)

    const { docs, truncated } = await collectRows(
      context.engine as unknown as FindEngine,
      { collection: 'event-rsvps', where: { event: { equals: eventId } }, sort: 'createdAt', depth: 0, user: context.user },
      CHECKIN_MAX_ROWS,
    )
    const attendees: CheckInAttendee[] = []
    for (const doc of docs) {
      const attendee = parseAttendee(doc)
      if (attendee) attendees.push(attendee)
    }

    return json({
      event: { id: eventId, title: typeof event.title === 'string' ? event.title : '' },
      attendees,
      truncated,
    })
  } catch (error) {
    console.error('admin-event-checkin GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return json({ error: refusal }, 403)

    const access = await guard('write')
    if (!access.context) return access.response!
    const { context } = access

    const body = await request.json().catch((): null => null)
    const parsed = parseCheckInRequest(body)
    if (parsed.ok === false) return json({ error: parsed.error }, 400)
    const { rsvpId, checkedIn } = parsed.request

    const engine = context.engine as never
    const rsvp = (await context.engine
      .findByID({ collection: 'event-rsvps', id: rsvpId, depth: 0, user: context.user })
      .catch((): null => null)) as Record<string, unknown> | null
    if (!rsvp) return json({ error: 'That guest does not exist.' }, 404)

    const current = parseAttendee(rsvp)
    if (current && current.checkedIn === checkedIn) {
      return json({ id: rsvpId, checkedIn, checkedInAt: current.checkedInAt, changed: false })
    }

    const at = new Date().toISOString()
    const data = { checkedIn, checkedInAt: checkedIn ? at : null }
    await context.engine.update({ collection: 'event-rsvps', id: rsvpId, data: data as never, user: context.user } as never)

    try {
      const settings = await getSecuritySettings(engine)
      await audit(
        {
          action: 'update',
          collectionSlug: 'event-rsvps',
          documentId: rsvpId,
          actorId: (context.user as { id?: number | string } | null)?.id ?? null,
          actorEmail: (context.user as { email?: string } | null)?.email ?? null,
          detail: checkedIn ? 'Checked in at the door' : 'Check-in undone',
          ...auditContext(request),
        },
        settings,
      )
    } catch {
      // The change is saved; a failed audit write is logged by auditLog.ts and must not fail the request.
    }

    return json({ id: rsvpId, checkedIn, checkedInAt: data.checkedInAt, changed: true })
  } catch (error) {
    console.error('admin-event-checkin POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
