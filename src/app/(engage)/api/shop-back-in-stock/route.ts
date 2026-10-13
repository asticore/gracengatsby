import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { BACK_IN_STOCK_RATE_LIMIT_PER_MINUTE, type BackInStockInput } from '@/features/ecommerce/lib/backInStock'
import { recordBackInStockSignup, type BackInStockEngine } from '@/features/ecommerce/backInStockSignup'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

/**
 * POST { productId, variation?, email, website? } - "Email me when it is back".
 * Rate limited, honeypot trapped, and answered the same way whether or not a sign-up was stored.
 * Only the Shop setting being off is reported, because that is a fact about the shop, not the visitor.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`back-in-stock:${clientKey(request)}`, BACK_IN_STOCK_RATE_LIMIT_PER_MINUTE)
  if (decision.limited) {
    return NextResponse.json({ ok: false, message: 'Too many requests. Please wait a moment and try again.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch((): null => null)) as BackInStockInput | null
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })

  const engine = (await getEngine()) as unknown as BackInStockEngine
  const result = await recordBackInStockSignup(engine, body)
  if (result.kind === 'invalid') return NextResponse.json({ ok: false, message: 'Please check the form.', errors: result.errors }, { status: 400 })
  if (result.kind === 'off') return NextResponse.json({ ok: false, message: 'Back-in-stock emails are turned off.' }, { status: 403 })
  return NextResponse.json({ ok: true, message: result.message }, { status: 200 })
}