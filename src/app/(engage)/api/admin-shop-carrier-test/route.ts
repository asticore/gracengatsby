import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getAdapter, normaliseShippingConfig } from '@/features/ecommerce/shipping/registry'
import type { CarrierId } from '@/features/ecommerce/shipping/types'

export const dynamic = 'force-dynamic'

/** POST { carrier } - checks the saved keys for one carrier. Admin only. Never echoes a key. */
export async function POST(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!context.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = (await request.json().catch(() => ({}))) as { carrier?: unknown }
  const doc = await (context.engine as unknown as { findGlobal: (a: unknown) => Promise<unknown> }).findGlobal({ slug: 'shipping-settings', depth: 0, overrideAccess: true }).catch(() => ({}))
  const cfg = normaliseShippingConfig(doc)
  const carrier = cfg.carriers.find((c) => c.id === body.carrier)
  if (!carrier) return NextResponse.json({ error: 'Unknown carrier.' }, { status: 400 })
  try {
    return NextResponse.json(await getAdapter(carrier.id as CarrierId).testConnection(carrier.creds))
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'The test failed.' })
  }
}
