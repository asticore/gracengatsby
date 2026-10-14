import { NextResponse } from 'next/server'

import { authorizeOrders } from '@/features/ecommerce/server/adminOrder'
import { labelledOrderOptions, manifestCarrierOptions } from '@/features/ecommerce/server/manifestOptions'
import { createManifest, type ShipEngine } from '@/features/ecommerce/server/shipments'

export const dynamic = 'force-dynamic'

/**
 * GET - what the Orders list manifest action needs: the carriers switched on with their keys saved, and the
 * labelled orders to pick from (newest first). Needs orders.read.
 */
export async function GET(): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const shipping = await auth.engine.findGlobal({ slug: 'shipping-settings', depth: 0, overrideAccess: true }).catch((): Record<string, unknown> => ({}))
  const labelled = await auth.engine.find({ collection: 'orders', where: { shippedAt: { exists: true } }, sort: '-shippedAt', limit: 200, depth: 0, overrideAccess: true }).catch((): { docs: Record<string, unknown>[] } => ({ docs: [] }))
  return NextResponse.json({ carriers: manifestCarrierOptions(shipping), orders: labelledOrderOptions(labelled.docs) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST { orderIds: number[], carrier? } - the bulk "Create manifest" action. Needs orders.update. */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeOrders('update')
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as { orderIds?: unknown; carrier?: unknown; all?: unknown }
  let ids = (Array.isArray(body.orderIds) ? body.orderIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0)
  if (ids.length === 0 && body.all === true) {
    // No selection: every order that has a label (shippedAt set), newest first. createManifest skips parcels already on a manifest.
    const found = await auth.engine.find({ collection: 'orders', where: { shippedAt: { exists: true } }, sort: '-shippedAt', limit: 200, depth: 0, overrideAccess: true })
    ids = found.docs.map((d) => Number(d.id)).filter((n) => Number.isInteger(n))
  }
  if (ids.length === 0) return NextResponse.json({ error: 'No labelled orders found.' }, { status: 400 })
  try {
    const { manifest, id } = await createManifest(auth.engine as unknown as ShipEngine, ids, { carrier: typeof body.carrier === 'string' && body.carrier ? body.carrier : undefined })
    return NextResponse.json({ id, number: manifest.number, totals: manifest.totals, htmlUrl: `/api/admin-shop-manifest/${id}`, csvUrl: `/api/admin-shop-manifest/${id}?format=csv` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create the manifest.' }, { status: 400 })
  }
}
