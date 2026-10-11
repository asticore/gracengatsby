import { getEngine } from '@/engine'
import { verifyCartToken } from '@/features/ecommerce/lib/abandonedCart'

export const dynamic = 'force-dynamic'

/**
 * GET ?t=<signed token> - restores the shopper's cart in their browser and
 * sends them to checkout. The token is HMAC-signed, expires, and works only for
 * recovering (not for unsubscribing).
 */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const verified = await verifyCartToken(process.env.ENGAGE_SECRET ?? '', token, 'recover')
  if (!verified.ok) return new Response('This link is invalid or has expired.', { status: 400 })
  const engine = await getEngine()
  const cart = (await engine.findByID({ collection: 'carts', id: verified.cartId, depth: 0, overrideAccess: true }).catch((): null => null)) as { id: number; secret?: string; purchasedAt?: string } | null
  if (!cart || cart.purchasedAt || !cart.secret) return Response.redirect(new URL('/shop', request.url).toString(), 302)
  const payload = JSON.stringify({ id: cart.id, secret: cart.secret }).replace(/</g, '\\u003c')
  const html = `<!doctype html><meta charset="utf-8"><title>Restoring your cart</title><script>try{localStorage.setItem('gracengatsby-cart',${JSON.stringify(payload)})}catch(e){}location.replace('/checkout')</script><noscript><a href="/checkout">Continue to checkout</a></noscript>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
