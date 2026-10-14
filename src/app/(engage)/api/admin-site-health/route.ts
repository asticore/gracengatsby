import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getAdminContext } from '@/admin/auth'
import { gatherSiteHealth } from '@/features/health/collect'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-site-health
 * The Site health report: storage, scheduled job health, versions, site settings and warnings.
 * Admin only.
 */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) return json({ error: 'Unauthorised' }, 401)

    const { env } = await getCloudflareContext({ async: true })
    const report = await gatherSiteHealth(context.engine, env.D1, env.R2)
    return json(report)
  } catch (error) {
    console.error('admin-site-health GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
