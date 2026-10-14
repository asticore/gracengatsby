import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { clientKey, hit } from '@/features/security/rateLimit'
import { CheckoutError } from '@/features/ecommerce/server/pricing'
import { createPayPalCheckout } from '@/features/ecommerce/payments/paypalCheckout'
import { PayPalError } from '@/features/ecommerce/payments/paypalAdapter'
import { loadShopCurrency } from '@/features/ecommerce/lib/shopCurrency'

export const dynamic = 'force-dynamic'

const str = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '')
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined)

/**
 * POST { cartID, secret, customerEmail?, shippingAddress?, billingAddress?, couponCode?, shippingOptionId?,
 *        checkoutFields?, giftCardCodes?, useStoreCredit? }
 * Prices the cart on the server, saves the pending shop order and returns the PayPal order id for the buyer's popup.
 * The browser never supplies a total. Rate limited because it also checks gift card codes.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-paypal-create:${clientKey(request)}`, 20)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const engine = await getEngine()
  const cartId = Number(body.cartID)
  if (!Number.isInteger(cartId) || typeof body.secret !== 'string' || !body.secret) return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })
  const cart = (await engine.findByID({ collection: 'carts', id: cartId, depth: 0, overrideAccess: true })) as
    | { id: number; secret?: string | null; items?: never[] }
    | null
  if (!cart || !cart.secret || cart.secret !== body.secret) return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })
  if (!Array.isArray(cart.items) || cart.items.length === 0) return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })

  const auth = await (engine as unknown as { auth: (a: unknown) => Promise<{ user?: { id?: number; email?: string } | null }> })
    .auth({ headers: request.headers })
    .catch((): { user: null } => ({ user: null }))
  const user = auth.user?.id ? { id: Number(auth.user.id), email: auth.user.email } : null
  const customerEmail = user?.email ?? str(body.customerEmail).trim()
  if (!customerEmail) return NextResponse.json({ error: 'Please enter your email address.' }, { status: 400 })

  try {
    const result = await createPayPalCheckout(
      engine,
      {
        engine,
        cart: cart as never,
        currency: await loadShopCurrency(engine as never), // the shop's currency from Shop settings; never the client's
        customerEmail,
        billingAddress: obj(body.billingAddress),
        shippingAddress: obj(body.shippingAddress),
        user: user ? { id: user.id } : null,
        checkout: body,
      },
    )
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof PayPalError) return NextResponse.json({ error: 'PayPal could not start the payment. Please try again.' }, { status: 502 })
    return NextResponse.json({ error: 'Error starting PayPal checkout.' }, { status: 500 })
  }
}
