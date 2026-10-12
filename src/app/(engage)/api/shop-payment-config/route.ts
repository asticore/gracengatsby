import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { publicPaymentConfig } from '@/features/ecommerce/lib/paymentMethods'

export const dynamic = 'force-dynamic'

/** GET - what the storefront may know about payments (pay-in-4 messaging, wallets). Never returns a key. */
export async function GET(): Promise<Response> {
  try {
    const engine = (await getEngine()) as unknown as { findGlobal: (a: unknown) => Promise<Record<string, unknown>> }
    const doc = (await engine.findGlobal({ slug: 'payment-settings', depth: 0, overrideAccess: true })) as { general?: { currency?: string } }
    const currency = String(doc.general?.currency || 'AUD')
    return NextResponse.json(publicPaymentConfig(doc, currency), { headers: { 'Cache-Control': 'public, max-age=60' } })
  } catch {
    return NextResponse.json(publicPaymentConfig(null, 'AUD'), { headers: { 'Cache-Control': 'no-store' } })
  }
}
