import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { loadPaymentSettings } from '@/features/ecommerce/payments/config'
import { handlePayPalWebhook } from '@/features/ecommerce/payments/paypalWebhook'
import { withErrorLog } from '@/features/errors/withErrorLog'

export const dynamic = 'force-dynamic'

/**
 * POST: PayPal's webhook. The event is only acted on after PayPal confirms its signature (see paypalWebhook.ts).
 * PayPal retries any answer that is not a 2xx, so a failure inside here returns 500 and the event comes again.
 */
async function handleWebhook(request: Request): Promise<Response> {
  const rawBody = await request.text()
  const engine = await getEngine()
  const settings = await loadPaymentSettings(engine as never)
  try {
    const result = await handlePayPalWebhook(engine as never, settings.paypal ?? {}, { headers: request.headers, rawBody })
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not process this event.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

/** Failures are written to the error log (see src/features/errors/withErrorLog.ts). */
export const POST = withErrorLog(handleWebhook, 'paypal-webhook')