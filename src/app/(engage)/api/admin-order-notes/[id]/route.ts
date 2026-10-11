import { NextResponse } from 'next/server'

import { authorizeOrders, parseOrderId } from '@/features/ecommerce/server/adminOrder'
import { addOrderNote } from '@/features/ecommerce/server/orders'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const order = await auth.engine.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ notes: Array.isArray(order.notes) ? order.notes : [] }, { headers: { 'Cache-Control': 'no-store' } })
}

/** POST { text, type: 'internal' | 'customer' } - customer notes are emailed to the customer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('update')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; type?: unknown }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return NextResponse.json({ error: 'Write a note first.' }, { status: 400 })
  const note = await addOrderNote(auth.engine as never, id, { type: body.type === 'customer' ? 'customer' : 'internal', text, author: auth.user.email || `User ${auth.user.id}` })
  if (!note) return NextResponse.json({ error: 'The note could not be saved.' }, { status: 500 })
  return NextResponse.json({ note })
}
