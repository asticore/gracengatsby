import { NextResponse } from 'next/server'

import { excludeProtected } from '@/features/visibility/excludeProtected'
import { getEngine } from '@/engine'
import { validateWishlistIds, wishlistEnabled } from '@/features/ecommerce/lib/wishlist'
import { wishlistCards } from '@/features/ecommerce/lib/wishlistCards'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
  findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * POST { ids: number[] } (at most 100) - the saved product cards for the visitor's wishlist.
 * Public: only published products, and only title, slug, price and image are returned.
 * Ids are sent in the body rather than the URL so the list never has to be path-safe.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`wishlist:${clientKey(request)}`, 60)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }

  const body = (await request.json().catch((): null => null)) as { ids?: unknown } | null
  const checked = validateWishlistIds(body?.ids)
  if (checked.ok === false) return NextResponse.json({ error: checked.error }, { status: 400, headers: NO_STORE })

  const engine = (await getEngine()) as unknown as EngineLike
  const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  if (!wishlistEnabled(settings)) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE })

  if (checked.ids.length === 0) return NextResponse.json({ products: [] }, { headers: NO_STORE })
  const { docs: found } = await engine.find({
    collection: 'products',
    where: { and: [{ _status: { equals: 'published' } }, { id: { in: checked.ids } }] },
    limit: checked.ids.length,
    depth: 1,
    overrideAccess: true,
  })
  const docs = (await excludeProtected('products', found as { id?: number | string | null }[])) as typeof found
  return NextResponse.json({ products: wishlistCards(docs, checked.ids) }, { headers: NO_STORE })
}