import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { parseRecurrence } from '@/features/editScreens/recurrence'
import { planOccurrences, type GenerateParent } from '@/features/editScreens/recurrenceGenerate'
import { EVENT_TIME_ZONE, localDateIn } from '@/features/editScreens/timeZone'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-event-generate?id=<event id>
 *
 * Creates the other dates of a repeating event as draft child events, each linked to the
 * parent (seriesOf) and copying its title, description, picture, location and ticket tiers.
 * The parent's own date is the first occurrence and is not created again. A date that already
 * has a child, or whose slug is taken, is skipped, so running it twice creates nothing new.
 *
 * Needs the same permission as editing the event (admins, or the events update permission, and
 * an own-scoped grant only for events the user made). Works on the saved event, not unsaved edits.
 * Answers { ok, created, skipped, failed, truncated }.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!context.isAdmin && !context.permissions.collections?.events?.update) return json({ error: 'Forbidden' }, 403)

    const raw = new URL(request.url).searchParams.get('id')
    const id = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'Add ?id=<event id>.' }, 400)

    const access = await assertDocAccess(context, 'events', id, 'update')
    if (!access.ok) return docAccessDenied(access)

    const engine = context.engine as unknown as {
      findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
      find: (args: Record<string, unknown>) => Promise<{ docs: Record<string, unknown>[] }>
      create: (args: Record<string, unknown>) => Promise<unknown>
    }

    const parent = await engine
      .findByID({ collection: 'events', id, depth: 0, overrideAccess: true })
      .catch((): null => null)
    if (!parent || parent.trashedAt) return json({ error: 'That event does not exist.' }, 404)

    const rule = parseRecurrence(parent.recurrence, EVENT_TIME_ZONE)
    if (!rule) {
      return json({ error: 'Choose Every day, Every week or Every month under Repeats, then save the event first.' }, 400)
    }

    const children = await engine.find({
      collection: 'events',
      where: { seriesOf: { equals: id } },
      depth: 0,
      limit: 0,
      overrideAccess: true,
    })
    const existingDates = new Set(
      children.docs
        .map((doc) => (typeof doc.startDate === 'string' ? localDateIn(new Date(doc.startDate), EVENT_TIME_ZONE) : null))
        .filter((date): date is string => date !== null),
    )

    const plan = planOccurrences({
      parent: parent as unknown as GenerateParent,
      rule,
      existingDates,
      takenSlugs: new Set(),
      timeZone: EVENT_TIME_ZONE,
    })

    let skipped = plan.skipped
    let created = 0
    let failed = 0
    for (const item of plan.create) {
      // A slug used by any event (even an unrelated one) cannot be reused, so that date is skipped.
      const taken = await engine.find({
        collection: 'events',
        where: { slug: { equals: item.slug } },
        depth: 0,
        limit: 1,
        overrideAccess: true,
      })
      if (taken.docs.length > 0) {
        skipped += 1
        continue
      }
      try {
        await engine.create({
          collection: 'events',
          data: { ...item.data, slug: item.slug },
          overrideAccess: true,
          user: context.user,
        })
        created += 1
      } catch (error) {
        console.error('admin-event-generate create error:', error)
        failed += 1
      }
    }

    return json({ ok: true, created, skipped, failed, truncated: plan.truncated })
  } catch (error) {
    console.error('admin-event-generate error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
