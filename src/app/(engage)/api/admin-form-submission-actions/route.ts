import { NextResponse } from 'next/server'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { adminRequestRefusal } from '@/features/forms/origin'
import { applyInboxPatch, parseInboxPatch } from '@/features/forms/submissionsApi'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/admin-form-submission-actions
 *   { ids: [1, 2, 3], status?: 'new'|'read'|'spam'|'archived', assignee?: <user id>|null, notes?: string }
 *
 * Changes the status, assignee or notes of up to 100 entries at once. Nothing
 * else about an entry can be changed here. Each update goes through the
 * collection's own access rules as the signed-in person, so someone who may not
 * update entries gets a refusal per entry rather than a back door.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const refusal = adminRequestRefusal(request)
    if (refusal) return json({ error: refusal }, 403)
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!context.permissions.collections?.['form-submissions']?.update) return json({ error: 'Forbidden' }, 403)

    const body = (await request.json().catch((): null => null)) as Record<string, unknown> | null
    if (!body) return json({ error: 'Send a JSON body.' }, 400)

    const { patch, error } = parseInboxPatch(body)
    if (!patch) return json({ error }, 400)
    if (!Array.isArray(body.ids) || body.ids.length === 0) return json({ error: 'Choose at least one entry.' }, 400)

    const result = await applyInboxPatch(context.engine as never, body.ids, patch, context.user)
    return json(result, result.failed.length > 0 && result.changed.length === 0 ? 403 : 200)
  } catch (error) {
    console.error('admin-form-submission-actions POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
