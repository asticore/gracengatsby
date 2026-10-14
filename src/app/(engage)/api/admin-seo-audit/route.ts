import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { AUDIT_COLLECTIONS, summariseAuditRows, type AuditCollection } from '@/features/seo/audit'
import { loadAuditRows, type AuditFindEngine } from '@/features/seo/auditLoader'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-seo-audit
 * Returns { rows, summary } for every published page, post, product and event
 * the signed-in user may read. Admin only (or a role that can read the place).
 */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)

    const can = context.can as unknown as (resource: string, action: string) => boolean
    const allowed: AuditCollection[] = AUDIT_COLLECTIONS.filter((collection) => context.isAdmin || can(collection, 'read'))
    if (allowed.length === 0) return json({ error: 'Unauthorised' }, 401)

    const rows = await loadAuditRows(context.engine as unknown as AuditFindEngine, allowed)
    return json({ rows, summary: summariseAuditRows(rows) })
  } catch (error) {
    console.error('admin-seo-audit GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}