import { NextResponse } from 'next/server'

import { renderInvoiceHtml } from '@/features/ecommerce/lib/invoice'
import { authorizeOrders, htmlResponse, loadInvoiceData, parseOrderId } from '@/features/ecommerce/server/adminOrder'
import { rawD1 } from '@/features/ecommerce/server/db'
import { ensureInvoiceNumber } from '@/features/ecommerce/numbering'

export const dynamic = 'force-dynamic'

/** GET /api/admin-order-invoice/:id - printable HTML, admin / orders.read only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // A paid order that has no invoice number yet (paid before numbering existed, or the payment step could not) gets one now.
  await ensureInvoiceNumber(await rawD1(), id).catch((): null => null)
  const data = await loadInvoiceData(auth.engine, id)
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return htmlResponse(renderInvoiceHtml(data.order, data.store, data.settings))
}
