import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { bundleContentsOf, resolveBundle, type BundleEngine } from '@/features/ecommerce/server/bundles'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_CART_PRODUCTS = 50

type Doc = Record<string, unknown> & { id: number; _status?: string | null }

/**
 * POST { productIds: number[] } - returns, for each bundle among these products, what one bundle costs right now
 * (whole cents, or null when it cannot be bought), whether it is available, and what it contains. Public fields only.
 * The cart shows this; the server prices the order again at checkout.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-bundles:${clientKey(request)}`, 60)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch((): null => null)) as { productIds?: unknown } | null
  if (!body || !Array.isArray(body.productIds)) return NextResponse.json({ error: 'productIds must be a list.' }, { status: 400 })
  const ids = [...new Set(body.productIds.slice(0, MAX_CART_PRODUCTS).map(Number).filter((id) => Number.isInteger(id) && id > 0))]
  const engine = (await getEngine()) as unknown as BundleEngine & { find: (a: unknown) => Promise<{ docs: Doc[] }> }
  if (ids.length === 0) return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } })
  const { docs } = await engine
    .find({ collection: 'products', where: { and: [{ _status: { equals: 'published' } }, { productType: { equals: 'bundle' } }, { id: { in: ids } }] }, limit: MAX_CART_PRODUCTS, depth: 0, overrideAccess: true })
    .catch((): { docs: Doc[] } => ({ docs: [] }))
  const out: Record<string, { priceCents: number | null; available: boolean; contents: Array<{ title: string; quantity: number }> }> = {}
  for (const doc of docs) {
    const result = await resolveBundle(engine, doc, 1, new Date(), new Map())
    const contents = (await bundleContentsOf(engine, doc)).map((c) => ({ title: c.title, quantity: c.quantity }))
    out[String(doc.id)] = { priceCents: result.ok ? result.unitCents : null, available: result.ok, contents }
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
