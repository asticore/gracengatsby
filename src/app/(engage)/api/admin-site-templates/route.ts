import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { KIND_LABELS, type SiteTemplateKind } from '@/features/siteTemplates/kinds'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET: the enabled site templates for the Template part picker ({ options: [{ label, value }] }). Any kind can be
 * placed as a part; the value is the template id the part stores.
 */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    const engine = await getEngine()
    const result = (await engine.find({
      collection: 'site-templates',
      where: { enabled: { equals: true } },
      sort: 'name',
      limit: 200,
      depth: 0,
    } as never)) as unknown as { docs?: { id: number | string; name?: string | null; kind?: string | null }[] }
    const options = (result?.docs ?? []).map((doc) => {
      const kind = KIND_LABELS[doc.kind as SiteTemplateKind] ?? String(doc.kind ?? '')
      const name = doc.name || `Template ${doc.id}`
      return { label: kind ? `${name} (${kind})` : name, value: String(doc.id) }
    })
    return json({ options })
  } catch (error) {
    console.error('admin-site-templates GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
