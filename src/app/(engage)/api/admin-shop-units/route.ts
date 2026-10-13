import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { normaliseUnitSystem } from '@/features/ecommerce/lib/units'

export const dynamic = 'force-dynamic'

/** GET - returns only the shop's unit system ({ system: 'metric' | 'imperial' }) for the product form's weight and size boxes. Signed-in admin users only. */
export async function GET(): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const engine = context.engine as unknown as { findGlobal: (args: unknown) => Promise<{ general?: { unitSystem?: unknown } } | null> }
  const shop = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  return NextResponse.json({ system: normaliseUnitSystem(shop?.general?.unitSystem) }, { headers: { 'Cache-Control': 'no-store' } })
}