import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { quoteStoredValue, loadGiftCardSettings, creditBalance, type StoredValueEngine } from '@/features/ecommerce/server/storedValue'
import { priceCart, loadShopConfig, shopCurrency, CheckoutError, type PricingEngine } from '@/features/ecommerce/server/pricing'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * POST { cartID, secret, address, email?, couponCode?, shippingOptionId? }
 * Returns shipping options, the coupon result and the full priced totals - all
 * recomputed on the server from database prices. Rate limited because it
 * doubles as a coupon-code checker.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-quote:${clientKey(request)}`, 20)
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
    // Signed-in buyers get their role-based pricing rules here too, so the quote matches what checkout charges.
    const auth = await (engine as unknown as { auth: (a: unknown) => Promise<{ user?: { id?: number; roles?: string[] } | null }> }).auth({ headers: request.headers }).catch((): { user: null } => ({ user: null }))
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
        customerRoles: Array.isArray(auth.user?.roles) ? auth.user.roles : [],
      },
      config,
    )
    // Gift cards and store credit: only typed codes and a yes/no for credit come from the browser.
    const codes = Array.isArray(body.giftCardCodes) ? (body.giftCardCodes as unknown[]).slice(0, 5) : []
    const userId = auth.user?.id ? Number(auth.user.id) : null
    const giftSettings = await loadGiftCardSettings(engine as unknown as StoredValueEngine)
    const stored = await quoteStoredValue(engine as unknown as StoredValueEngine, {
      codes,
      useCredit: body.useStoreCredit === true,
      userId,
      totalCents: totals.totalCents,
      lines: totals.lines.map((l) => ({ productId: l.productId, netCents: l.lineCents - l.discountCents, isGiftCard: Boolean(l.isGiftCard) })),
      currency: shopCurrency(config),
    })
    const storedValue = {
      giftCardsEnabled: giftSettings.enabled,
      creditAvailable: giftSettings.storeCreditEnabled && userId !== null,
      creditBalanceCents: giftSettings.storeCreditEnabled && userId !== null ? await creditBalance(userId) : 0,
      cards: stored.cards,
      creditCents: stored.plan.creditCents,
      coveredCents: stored.plan.coveredCents,
      payableCents: stored.plan.payableCents,
      // One generic message: never say whether a code exists or why it was refused.
      error: codes.length > 0 && stored.errors.length > 0 ? 'That gift card cannot be used.' : null,
    }
    return NextResponse.json(
      {
        storedValue,
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
