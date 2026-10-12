import { NextResponse } from 'next/server'

import { authorizeOrders, parseOrderId } from '@/features/ecommerce/server/adminOrder'
import { buyLabel, chosenService, type ShipEngine } from '@/features/ecommerce/server/shipments'
import { carrierDef } from '@/features/ecommerce/shipping/catalogue'
import { normaliseShippingConfig } from '@/features/ecommerce/shipping/registry'

export const dynamic = 'force-dynamic'

/** GET - what the Buy label panel needs: enabled carriers, the customer's choice and labels already bought. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const order = await auth.engine.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const cfg = normaliseShippingConfig(await auth.engine.findGlobal({ slug: 'shipping-settings', depth: 0, overrideAccess: true }).catch(() => ({})))
  const carriers = cfg.carriers.filter((c) => c.enabled).map((c) => ({ id: c.id, label: carrierDef(c.id)?.label ?? c.id, labels: carrierDef(c.id)?.live.labels === true }))
  return NextResponse.json({ carriers, chosen: chosenService(order), shipments: order.shipments ?? [], trackingNumber: order.trackingNumber ?? '' }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST { carrier?, serviceCode? } - buys a label, stores tracking on the order, sends the shipped email. Needs orders.update. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('update')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const result = await buyLabel(auth.engine as unknown as ShipEngine, id, {
      carrier: typeof body.carrier === 'string' ? body.carrier : undefined,
      serviceCode: typeof body.serviceCode === 'string' ? body.serviceCode : undefined,
    })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not buy the label.' }, { status: 400 })
  }
}
