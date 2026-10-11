import { NextResponse } from 'next/server'

import { renderPackingSlipHtml } from '@/features/ecommerce/lib/invoice'
import { authorizeOrders, htmlResponse, loadInvoiceData, parseOrderId } from '@/features/ecommerce/server/adminOrder'

export const dynamic = 'force-dynamic'

/** GET /api/admin-order-packing-slip/:id - printable HTML, admin / orders.read only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = await loadInvoiceData(auth.engine, id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return htmlResponse(renderPackingSlipHtml(data.order, data.store))
}