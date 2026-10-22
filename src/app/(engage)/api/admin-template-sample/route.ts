import { NextResponse } from 'next/server'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { loadSiteDetails } from '@/features/site/details'
import { blockContextFor, sampleCollectionFor } from '@/lib/blockContextFrom'

export const dynamic = 'force-dynamic'

const json = (body: unknown, status = 200): Response => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * GET /api/admin-template-sample?kind=single-post
 *   A few recent published items to preview a site template with: { items: [{ id, title }] }.
 * GET /api/admin-template-sample?kind=single-post&id=12
 *   The BlockContext the live route would build for that item: { context }.
 * Needs admin panel access. Only published documents are offered.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!hasAdminPanelAccess(context.user)) return json({ error: 'Unauthorised' }, 401)
    const params = new URL(request.url).searchParams
    const collection = sampleCollectionFor(params.get('kind'))
    if (!collection) return json({ items: [] })
    const id = params.get('id')
    const find = context.engine.find as unknown as (a: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
    if (id !== null) {
      if (!/^\d{1,12}$/.test(id)) return json({ error: 'bad id' }, 400)
      const { docs } = await find.call(context.engine, { collection, where: { and: [{ id: { equals: Number(id) } }, { _status: { equals: 'published' } }] }, limit: 1, depth: 1 })
      if (!docs[0]) return json({ error: 'not found' }, 404)
      return json({ context: blockContextFor(collection, docs[0], (await loadSiteDetails()).businessName) })
    }
    const { docs } = await find.call(context.engine, { collection, where: { _status: { equals: 'published' } }, sort: '-updatedAt', limit: 8, depth: 0 })
    return json({ items: docs.map((d) => ({ id: d.id, title: String(d.title ?? d.id) })) })
  } catch (error) {
    console.error('admin-template-sample GET error:', error)
    return json({ error: 'Internal server error' }, 500)
  }
}
