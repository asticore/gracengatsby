import { NextResponse } from 'next/server'

import { authorizeOrders, parseOrderId } from '@/features/ecommerce/server/adminOrder'
import { refundedByLine, refundedShippingCents } from '@/features/ecommerce/lib/refundLines'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const order = await auth.engine.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const refunds = await auth.engine.find({ collection: 'order-refunds', where: { order: { equals: id } }, sort: '-createdAt', limit: 100, depth: 0, overrideAccess: true })
  const perLine = Object.fromEntries([...refundedByLine(refunds.docs as never[])].map(([lineId, done]) => [lineId, done]))
  return NextResponse.json(
    {
      refunds: refunds.docs,
      amount: order.amount ?? 0,
      refundedTotal: order.refundedTotal ?? 0,
      status: order.status,
      lineItems: order.lineItems ?? [],
      refundedByLine: perLine,
      shippingTotal: order.shippingTotal ?? 0,
      shippingRefunded: refundedShippingCents(refunds.docs as never[]),
      pricesIncludeTax: Boolean(order.pricesIncludeTax),
      canCardRefund: Boolean(order.paymentIntentId),
      canStoreCredit: Boolean(order.customer),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST { amountCents, reason?, restock?, manual?, toStoreCredit?, items? } - needs orders.update (or admin).
 * Line-item refund: POST { lines: [{lineId, quantity, amount, restock}], shippingCents?, reason?, manual?, toStoreCredit? }
 * - the amount is worked out from the lines, never taken from the client. lineId is the line's position on the order.
 * The refund collection's hooks enforce the paid cap atomically and call the provider.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('update')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const lineMode = Array.isArray(body.lines) || body.shippingCents !== undefined
  try {
    const refund = await auth.engine.create({
      collection: 'order-refunds',
      data: {
        order: id,
        amount: lineMode ? undefined : body.amountCents,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
        restock: body.restock === true,
        method: body.toStoreCredit === true ? 'store-credit' : body.manual === true ? 'manual' : 'auto',
        items: Array.isArray(body.items) ? body.items : undefined,
        ...(lineMode ? { lines: Array.isArray(body.lines) ? body.lines : [], shippingAmount: body.shippingCents ?? 0 } : {}),
      },
      overrideAccess: true,
      user: auth.user,
    })
    return NextResponse.json({ refund })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The refund failed.' }, { status: 400 })
  }
}
