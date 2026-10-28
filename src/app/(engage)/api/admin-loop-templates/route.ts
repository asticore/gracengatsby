import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** GET: the enabled loop templates for the Loop grid's template dropdown ({ options: [{ label, value }] }). */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    const engine = await getEngine()
    const result = (await engine.find({
      collection: 'site-templates',
      where: { and: [{ kind: { equals: 'loop' } }, { enabled: { equals: true } }] },
      sort: 'name',
      limit: 100,
      depth: 0,
    } as never)) as unknown as { docs?: { id: number | string; name?: string | null }[] }
    const options = (result?.docs ?? []).map((doc) => ({ label: doc.name || `Loop template ${doc.id}`, value: String(doc.id) }))
    return json({ options })
  } catch (error) {
    console.error('admin-loop-templates GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
