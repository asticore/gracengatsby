import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getStripeClient } from '@/features/ecommerce/payments/stripeAdapter'
import { loadPaymentSettings, resolveStripeSecret } from '@/features/ecommerce/payments/config'

export const dynamic = 'force-dynamic'

/** POST { provider: 'stripe' | 'paypal' } - checks the saved keys with the cheapest real call. Admin only. */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!context.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { provider?: unknown }
  const settings = await loadPaymentSettings(context.engine as never)
  if (body.provider === 'stripe') {
    const key = resolveStripeSecret(settings)
    if (!key) return NextResponse.json({ ok: false, message: 'No Stripe secret key is saved. Add one and save first.' })
    try {
      const balance = await getStripeClient(key).balance.retrieve()
      return NextResponse.json({ ok: true, message: `Stripe connected (${balance.livemode ? 'live' : 'test'} mode).` })
    } catch (error) {
      return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Stripe refused the key.' })
    }
  }
  if (body.provider === 'paypal') {
    const p = settings.paypal
    if (!p?.clientId || !p.clientSecret) return NextResponse.json({ ok: false, message: 'Add the PayPal client ID and secret and save first.' })
    const host = p.environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
    try {
      const res = await fetch(`${host}/v1/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${p.clientId}:${p.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials',
      })
      if (!res.ok) return NextResponse.json({ ok: false, message: `PayPal refused the keys (${res.status}). Check the environment matches the keys.` })
      return NextResponse.json({ ok: true, message: `PayPal connected (${p.environment === 'live' ? 'live' : 'sandbox'}). PayPal checkout is on when it is switched on in Payments.` })
    } catch {
      return NextResponse.json({ ok: false, message: 'Could not reach PayPal.' })
    }
  }
  return NextResponse.json({ error: 'Unknown provider.' }, { status: 400 })
}