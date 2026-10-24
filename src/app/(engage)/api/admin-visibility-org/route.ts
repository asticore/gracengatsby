import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { resolveD1Binding } from '@/cms/db/connect'
import { noteDocumentChanged } from '@/features/dataViews/cache'
import { clearOrgVisibility, getOrgVisibility, isOrgVisibleCollection, setOrgVisibility } from '@/features/organizations/visibility'
import type { D1Like } from '@/features/organizations/store'
import { assertDocAccess, docAccessDenied } from '@/features/roles/docAccess'
import { getSecuritySettings } from '@/features/security/settings'

export const dynamic = 'force-dynamic'

/**
 * Admin-side switch for "Visible to members of organisation X" on a document.
 *   GET    ?collection=&id=            -> { enabled, organizationId, organizations: [{ id, name }] }
 *   POST   { collection, id, organizationId }
 *   DELETE ?collection=&id=
 * Same access rule as the password route: an admin, or someone who may update that document.
 */

const authorise = async (collection: string, id: number) => {
  const context = await getAdminContext()
  if (!(context.isAdmin || context.can('admin-visibility-password', 'update'))) return { response: NextResponse.json({ error: 'unauthorised' }, { status: 401 }) }
  if (!isOrgVisibleCollection(collection)) return { response: NextResponse.json({ error: 'Invalid collection' }, { status: 400 }) }
  if (!Number.isInteger(id) || id <= 0) return { response: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  const access = await assertDocAccess(context, collection, id, 'update')
  if (!access.ok) return { response: docAccessDenied(access) }
  return { context }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))
  const checked = await authorise(collection, id)
  if (checked.response) return checked.response
  try {
    const d1 = (await resolveD1Binding()) as unknown as D1Like
    const settings = await getSecuritySettings(checked.context.engine as never)
    const organizationId = await getOrgVisibility(d1, collection, id)
    const rows = ((await d1.prepare('SELECT id, name FROM `eg_organizations` ORDER BY name LIMIT 500').bind().all()).results ?? []) as { id: string; name: string }[]
    return NextResponse.json({ enabled: settings.organizations.enabled || organizationId !== null, organizationId, organizations: rows })
  } catch (error) {
    console.error('admin-visibility-org GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: { collection?: unknown; id?: unknown; organizationId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const collection = typeof body.collection === 'string' ? body.collection : ''
  const id = typeof body.id === 'number' ? body.id : NaN
  const checked = await authorise(collection, id)
  if (checked.response) return checked.response
  if (typeof body.organizationId !== 'string' || body.organizationId === '') return NextResponse.json({ error: 'Invalid organization' }, { status: 400 })
  try {
    const d1 = (await resolveD1Binding()) as unknown as D1Like
    const exists = await d1.prepare('SELECT 1 AS ok FROM `eg_organizations` WHERE id = ? LIMIT 1').bind(body.organizationId).first()
    if (!exists) return NextResponse.json({ error: 'Unknown organization' }, { status: 400 })
    await setOrgVisibility(d1, collection, id, body.organizationId, new Date().toISOString())
    noteDocumentChanged(collection)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin-visibility-org POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const collection = url.searchParams.get('collection') ?? ''
  const id = Number(url.searchParams.get('id'))
  const checked = await authorise(collection, id)
  if (checked.response) return checked.response
  try {
    await clearOrgVisibility((await resolveD1Binding()) as unknown as D1Like, collection, id)
    noteDocumentChanged(collection)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('admin-visibility-org DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
