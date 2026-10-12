import { NextResponse } from 'next/server'

import { manifestCsv, renderManifestHtml } from '@/features/ecommerce/lib/manifest'
import { normaliseUnitSystem } from '@/features/ecommerce/lib/units'
import { authorizeOrders, htmlResponse, parseOrderId } from '@/features/ecommerce/server/adminOrder'
import { loadManifest, type ShipEngine } from '@/features/ecommerce/server/shipments'

export const dynamic = 'force-dynamic'

/** GET /api/admin-shop-manifest/:id[?format=csv] - printable driver manifest or its CSV. Needs orders.read. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await authorizeOrders('read')
  if (!auth.ok) return auth.response
  const id = parseOrderId((await params).id)
  if (id === null) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const manifest = await loadManifest(auth.engine as unknown as ShipEngine, id)
  if (!manifest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (new URL(request.url).searchParams.get('format') === 'csv') {
    return new Response(manifestCsv(manifest), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="manifest-${manifest.number.replace(/[^A-Za-z0-9-]/g, '_')}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
  const shop = (await auth.engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch(() => ({}))) as { general?: { unitSystem?: string }; tax?: { businessName?: string } }
  const site = (await auth.engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch(() => ({}))) as { siteName?: string }
  return htmlResponse(renderManifestHtml(manifest, { storeName: String(shop.tax?.businessName || site.siteName || 'Shop'), unitSystem: normaliseUnitSystem(shop.general?.unitSystem) }))
}
