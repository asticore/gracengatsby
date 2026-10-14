import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { manageSubscription, type ManageAction } from '@/features/ecommerce/subscriptions/manage'
import { getStripeClient } from '@/features/ecommerce/payments/stripeAdapter'
import { stripeSecretFor } from '@/features/ecommerce/subscriptions/gate'
import type { SubEngine } from '@/features/ecommerce/subscriptions/records'

export const dynamic = 'force-dynamic'

const ACTIONS: ManageAction[] = ['cancel', 'keep', 'pause', 'resume']

/** POST { action: 'cancel' | 'keep' | 'pause' | 'resume' } for one subscription. Needs product-subscriptions.update. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(context.isAdmin || context.can('product-subscriptions', 'update'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const body = (await request.json().catch((): Record<string, unknown> => ({}))) as { action?: unknown }
  const action = ACTIONS.find((value) => value === body.action)
  if (!action) return NextResponse.json({ error: 'Choose a change to make.' }, { status: 400 })

  const engine = context.engine as unknown as SubEngine
  const secret = await stripeSecretFor(engine)
  if (!secret) return NextResponse.json({ error: 'Stripe card payments are not set up on this shop.' }, { status: 400 })
  const result = await manageSubscription({ engine, stripe: getStripeClient(secret) }, { id, action, actor: { by: 'staff' } })
  if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ status: result.status }, { headers: { 'Cache-Control': 'no-store' } })
}
