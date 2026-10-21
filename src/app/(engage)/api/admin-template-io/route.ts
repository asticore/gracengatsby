import { NextResponse } from 'next/server'
import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { buildTemplateExport, TEMPLATE_IO_MAX_BYTES, validateTemplateImport } from '@/features/siteTemplates/templateIo'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

/** GET ?id=<n>: downloads the site template as portable JSON. */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    const id = new URL(request.url).searchParams.get('id') || ''
    if (!/^\d+$/.test(id)) return json({ error: 'Missing or invalid id.' }, 400)
    const doc = await context.engine
      .findByID({ collection: 'site-templates', id: Number(id), depth: 0, overrideAccess: true } as never)
      .catch((): null => null)
    if (!doc) return json({ error: 'Template not found.' }, 404)
    const exported = buildTemplateExport(doc as never)
    const slug = exported.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template'
    return json(exported, 200, { 'Content-Disposition': `attachment; filename="${slug}.engage-template.json"` })
  } catch (error) {
    console.error('admin-template-io GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}

/** POST <exported JSON>: creates a disabled draft site template. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    if (!(context.isAdmin || context.can('site-templates', 'create'))) return json({ error: 'Forbidden' }, 403)

    const text = await request.text()
    if (text.length > TEMPLATE_IO_MAX_BYTES * 2) return json({ error: 'File is too large (500KB maximum).' }, 413)
    const result = validateTemplateImport(text)
    if (result.ok === false) return json({ error: result.error }, 400)
    const t = result.template

    const doc = await context.engine.create({
      collection: 'site-templates',
      data: { name: `${t.title} (imported)`, kind: t.kind, enabled: false, priority: t.priority, conditions: t.conditions, blocks: t.blocks },
      overrideAccess: true,
    } as never)
    const id = (doc as { id: number | string }).id
    return json({ ok: true, id, editorUrl: `/admin/visual-editor/collection/site-templates/${id}` })
  } catch (error) {
    console.error('admin-template-io POST error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
