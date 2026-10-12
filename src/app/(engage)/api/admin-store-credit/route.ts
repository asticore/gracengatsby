import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { adjustStoreCredit, creditBalance, type StoredValueEngine } from '@/features/ecommerce/server/storedValue'

export const dynamic = 'force-dynamic'

type Doc = Record<string, unknown>

async function authorize(action: 'read' | 'update') {
  const context = await getAdminContext()
  if (!context.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!(context.isAdmin || context.can('store-credits', action))) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, engine: context.engine as unknown as StoredValueEngine, user: context.user as unknown as { id: number } }
}

async function findCustomer(engine: StoredValueEngine, params: { userId?: unknown; email?: unknown }): Promise<Doc | null> {
  const id = Number(params.userId)
  if (Number.isInteger(id) && id > 0) return engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true })
  if (typeof params.email === 'string' && params.email.trim()) {
    const found = await engine.find({ collection: 'users', where: { email: { equals: params.email.trim().toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true })
    return found.docs[0] ?? null
  }
  return null
}

/** GET ?email= or ?userId= : the customer's balance and recent ledger. Needs store-credits.read. */
export async function GET(request: Request): Promise<Response> {
  const auth = await authorize('read')
  if (!auth.ok) return auth.response
  const url = new URL(request.url)
  const customer = await findCustomer(auth.engine, { userId: url.searchParams.get('userId'), email: url.searchParams.get('email') })
  if (!customer) return NextResponse.json({ error: 'No customer found.' }, { status: 404 })
  const userId = Number(customer.id)
  const ledger = await auth.engine.find({ collection: 'credit-ledger', where: { and: [{ user: { equals: userId } }, { kind: { equals: 'store-credit' } }] }, sort: '-createdAt', limit: 20, depth: 0, overrideAccess: true })
  return NextResponse.json({ user: { id: userId, email: customer.email }, balanceCents: await creditBalance(userId), ledger: ledger.docs }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST { userId | email, amountCents (positive), direction: 'add' | 'deduct', reason } - needs store-credits.update.
 * A reason is required: it is written to the credit ledger and shown to the customer.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize('update')
  if (!auth.ok) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) return NextResponse.json({ error: 'Give a reason. It is recorded in the ledger.' }, { status: 400 })
  const cents = Number(body.amountCents)
  if (!Number.isInteger(cents) || cents <= 0) return NextResponse.json({ error: 'Enter an amount greater than zero.' }, { status: 400 })
  const customer = await findCustomer(auth.engine, body)
  if (!customer) return NextResponse.json({ error: 'No customer found.' }, { status: 404 })
  try {
    const balance = await adjustStoreCredit(auth.engine, { userId: Number(customer.id), deltaCents: body.direction === 'deduct' ? -cents : cents, reason, createdBy: auth.user.id })
    return NextResponse.json({ balanceCents: balance })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not change the balance.' }, { status: 400 })
  }
}
