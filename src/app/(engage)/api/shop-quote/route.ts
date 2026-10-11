import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { priceCart, loadShopConfig, CheckoutError, type PricingEngine } from '@/features/ecommerce/server/pricing'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * POST { cartID, secret, address, email?, couponCode?, shippingOptionId? }
 * Returns shipping options, the coupon result and the full priced totals - all
 * recomputed on the server from database prices. Rate limited because it
 * doubles as a coupon-code checker.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-quote:${clientKey(request)}`, 40)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const engine = (await getEngine()) as unknown as PricingEngine & { findByID: (a: unknown) => Promise<Record<string, unknown> | null> }
  const cartId = Number(body.cartID)
  if (!Number.isInteger(cartId) || typeof body.secret !== 'string') return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })
  const cart = await engine.findByID({ collection: 'carts', id: cartId, depth: 0, overrideAccess: true })
  if (!cart || !cart.secret || cart.secret !== body.secret) return NextResponse.json({ error: 'Cart not found.' }, { status: 404 })

  const a = (body.address ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 100) : undefined)
  try {
    const config = await loadShopConfig(engine)
    const { totals } = await priceCart(
      engine,
      {
        items: (cart.items as never) ?? [],
        address: { country: str(a.country), state: str(a.state), postalCode: str(a.postalCode) },
        email: str(body.email),
        couponCode: str(body.couponCode),
        shippingOptionId: str(body.shippingOptionId),
        cartId,
      },
      config,
    )
    return NextResponse.json(
      {
        lines: totals.lines.map((l) => ({ name: l.name, quantity: l.quantity, lineCents: l.lineCents, discountCents: l.discountCents })),
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        shippingCents: totals.shippingCents,
        taxCents: totals.taxCents,
        taxLines: totals.taxLines,
        pricesIncludeTax: totals.pricesIncludeTax,
        totalCents: totals.totalCents,
        shippingOptions: totals.shippingOptions,
        coupon: totals.coupon,
        // One generic message: never say whether a code exists, is used up, or how often this email used it.
        couponError: totals.couponError ? 'Coupon not valid' : null,
        fields: config.fields.filter((f) => f.enabled),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof CheckoutError) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: 'Could not price your cart.' }, { status: 500 })
  }
}
