import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { SITE_TEMPLATE_KINDS } from '@/collections/SiteTemplates'
import { getStarter, STARTERS } from '@/features/siteTemplates/starters'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/** GET: the starters ({ starters: [{ id, kind, label, description }] }). */
export async function GET(): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    return json({ starters: STARTERS.map(({ id, kind, label, description }) => ({ id, kind, label, description })) })
  } catch (error) {
    console.error('admin-template-starters GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

/** POST { starterId }: creates a draft (disabled) site template from the starter and returns its id. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!(context.isAdmin || context.can('site-templates', 'create'))) return json({ error: 'Forbidden' }, 403)

    const body = (await request.json().catch((): null => null)) as { starterId?: unknown } | null
    const starter = getStarter(body?.starterId)
    if (!starter || !SITE_TEMPLATE_KINDS.includes(starter.kind)) return json({ error: 'Unknown starter.' }, 400)

    const doc = await context.engine.create({
      collection: 'site-templates',
      data: { name: `${starter.label} (draft)`, kind: starter.kind, enabled: false, conditions: [], blocks: starter.blocks() },
      overrideAccess: true,
    } as never)
    const id = (doc as { id: number | string }).id
    return json({ ok: true, id, editorUrl: `/admin/visual-editor/collection/site-templates/${id}` })
  } catch (error) {
    console.error('admin-template-starters POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
