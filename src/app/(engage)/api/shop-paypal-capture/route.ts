import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { clientKey, hit } from '@/features/security/rateLimit'
import { capturePayPalCheckout } from '@/features/ecommerce/payments/paypalCheckout'
import { withErrorLog } from '@/features/errors/withErrorLog'

export const dynamic = 'force-dynamic'

/**
 * POST { cartID, secret, paypalOrderId }
 * Captures the PayPal order the buyer approved and marks the shop order paid. Idempotent: a repeat answers with the
 * same order without charging again. Amount and currency are checked against the stored order, never the browser.
 */
async function handleCapture(request: Request): Promise<Response> {
  // Completing a payment is not available while an admin is signed in as a customer.
  const blocked = refuseWhileImpersonating(request.headers)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 })
  const decision = hit(`shop-paypal-capture:${clientKey(request)}`, 30)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const engine = await getEngine()
  const cartId = Number(body.cartID)
  const paypalOrderId = typeof body.paypalOrderId === 'string' ? body.paypalOrderId : ''
  if (!Number.isInteger(cartId) || typeof body.secret !== 'string' || !body.secret || !/^[A-Za-z0-9]{8,40}$/.test(paypalOrderId)) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  }
  const cart = (await engine.findByID({ collection: 'carts', id: cartId, depth: 0, overrideAccess: true })) as { secret?: string | null } | null
  if (!cart || !cart.secret || cart.secret !== body.secret) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })

  try {
    const result = await capturePayPalCheckout(engine, { cartId, paypalOrderId })
    if (result.ok === false) return NextResponse.json({ error: result.message }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
    return NextResponse.json(
      { message: result.alreadyPaid ? 'Payment already received' : 'Payment received', orderID: result.orderId, transactionID: result.transactionId },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json({ error: 'Error confirming the PayPal payment. Check your PayPal account before trying again.' }, { status: 500 })
  }
}

/** Failures are written to the error log (see src/features/errors/withErrorLog.ts). */
export const POST = withErrorLog(handleCapture, 'paypal-capture')
