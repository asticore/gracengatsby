import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { getFeatureFlags } from '@/utilities/features'
import { clientKey, hit } from '@/features/security/rateLimit'
import { manageSubscription, type ManageAction } from '@/features/ecommerce/subscriptions/manage'
import { startSubscriptionCheckout } from '@/features/ecommerce/subscriptions/start'
import { getStripeClient } from '@/features/ecommerce/payments/stripeAdapter'
import { stripeSecretFor } from '@/features/ecommerce/subscriptions/gate'
import type { SubEngine } from '@/features/ecommerce/subscriptions/records'

export const dynamic = 'force-dynamic'

const MANAGE: ManageAction[] = ['cancel', 'keep', 'pause', 'resume']

/**
 * A signed-in customer's subscription requests. Body:
 *   { action: 'start', productId }        -> { url } for Stripe Checkout
 *   { action: 'cancel'|'keep'|'pause'|'resume', id } -> { status } for one of their own subscriptions
 * The customer is always the signed-in one; ids for anyone else answer "not found".
 */
export async function POST(request: Request): Promise<Response> {
  const flags = await getFeatureFlags()
  if (!flags.accounts) return NextResponse.json({ ok: false, error: 'Accounts are not available on this site.' }, { status: 404 })

  const engine = (await getEngine()) as unknown as SubEngine & { auth: (args: unknown) => Promise<{ user?: { id?: number; email?: string } | null }> }
  const auth = await engine.auth({ headers: request.headers }).catch((): { user: null } => ({ user: null }))
  const user = auth.user
  if (!user?.id) return NextResponse.json({ ok: false, error: 'Sign in to manage subscriptions.' }, { status: 401 })

  const decision = hit(`shop-subscriptions:${clientKey(request)}`, 30)
  if (decision.limited) return NextResponse.json({ ok: false, error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 })

  const body = (await request.json().catch((): Record<string, unknown> => ({}))) as Record<string, unknown>
  const userId = Number(user.id)

  if (body.action === 'start') {
    const productId = Number(body.productId)
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json({ ok: false, error: 'Choose a product.' }, { status: 400 })
    const product = (await engine.findByID({ collection: 'products', id: productId, depth: 0, overrideAccess: true }).catch((): null => null)) as Record<string, unknown> | null
    if (!product) return NextResponse.json({ ok: false, error: 'That product could not be found.' }, { status: 404 })
    const origin = new URL(request.url).origin
    const result = await startSubscriptionCheckout({
      engine,
      user: { id: userId, email: user.email },
      product: { id: productId, title: String(product.title ?? ''), slug: typeof product.slug === 'string' ? product.slug : undefined, productType: typeof product.productType === 'string' ? product.productType : undefined, subscription: product.subscription },
      origin,
    })
    if (!result.ok) return NextResponse.json(result, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  }

  const action = MANAGE.find((value) => value === body.action)
  const id = Number(body.id)
  if (!action || !Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 })
  const secret = await stripeSecretFor(engine)
  if (!secret) return NextResponse.json({ ok: false, error: 'Stripe card payments are not set up on this shop.' }, { status: 400 })
  const result = await manageSubscription({ engine, stripe: getStripeClient(secret) }, { id, action, actor: { by: 'customer', userId } })
  if (!result.ok) return NextResponse.json(result, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ ok: true, status: result.status }, { headers: { 'Cache-Control': 'no-store' } })
}
