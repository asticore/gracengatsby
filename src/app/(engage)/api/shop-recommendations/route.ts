import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { recommendationAnchors, recommendationCard, recommendedProducts, loadRecommendationSettings, type RecommendEngine } from '@/features/ecommerce/server/recommendations'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_CART_PRODUCTS = 50

/**
 * POST { productIds: number[] } - cart product ids in cart order.
 * Returns up to the shop's "most to show" product cards (public fields only), bought together or in the same category.
 * Returns [] while the shop's "Show product recommendations" switch is off.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-recommendations:${clientKey(request)}`, 60)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch((): null => null)) as { productIds?: unknown } | null
  if (!body || !Array.isArray(body.productIds)) return NextResponse.json({ error: 'productIds must be a list.' }, { status: 400 })
  const ids = recommendationAnchors(body.productIds.slice(0, MAX_CART_PRODUCTS))
  const engine = (await getEngine()) as unknown as RecommendEngine
  const settings = await loadRecommendationSettings(engine)
  if (!settings.enabled || ids.length === 0) return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })

  const { docs: cartDocs } = await engine
    .find({ collection: 'products', where: { and: [{ _status: { equals: 'published' } }, { id: { in: ids } }] }, limit: MAX_CART_PRODUCTS, depth: 0, overrideAccess: true })
    .catch((): { docs: Array<{ id: number; category?: unknown }> } => ({ docs: [] }))
  const anchors = cartDocs.map((doc) => doc.id)
  const categories = [...new Set(cartDocs.map((doc) => (typeof doc.category === 'string' ? doc.category : '')).filter(Boolean))]
  const docs = await recommendedProducts(engine, { anchorIds: anchors, categories, limit: settings.max })
  return NextResponse.json(docs.map(recommendationCard), { headers: { 'Cache-Control': 'no-store' } })
}
