import { NextResponse } from 'next/server'

import { getEngine } from '@/engine'
import { computeStockStatus } from '@/features/ecommerce/stock'
import { priceInfo } from '@/features/ecommerce/pricing'
import { CROSS_SELL_LIMIT, pickCrossSells, type CrossSellCard, type CrossSellCandidate, type CrossSellSource } from '@/features/ecommerce/lib/crossSells'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const MAX_CART_PRODUCTS = 50

type Doc = Record<string, unknown> & { id: number; _status?: string | null }
type Engine = {
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findGlobal: (a: unknown) => Promise<Record<string, unknown> | null>
}

const idOf = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

const cardFor = (doc: Doc): CrossSellCard => {
  const first = Array.isArray(doc.images) ? doc.images[0] : null
  const image = first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string' ? (first as { url: string }).url : null
  const info = priceInfo(doc as never)
  return {
    id: doc.id,
    title: String(doc.title ?? ''),
    slug: typeof doc.slug === 'string' ? doc.slug : null,
    price: info.price ?? (typeof doc.priceInAUD === 'number' ? doc.priceInAUD : null),
    image,
  }
}

/**
 * POST { productIds: number[] } - cart product ids in cart order.
 * Returns up to four product cards (public fields only) suggested by the products in the cart.
 * Returns [] while the shop's "Show cross-sells in the cart" setting is off.
 */
export async function POST(request: Request): Promise<Response> {
  const decision = hit(`shop-cross-sells:${clientKey(request)}`, 60)
  if (decision.limited) {
    return NextResponse.json({ error: 'Too many requests. Try again in a moment.' }, { status: 429, headers: { 'Retry-After': String(decision.retryAfterSeconds) } })
  }
  const body = (await request.json().catch((): null => null)) as { productIds?: unknown } | null
  if (!body || !Array.isArray(body.productIds)) return NextResponse.json({ error: 'productIds must be a list.' }, { status: 400 })
  const productIds: number[] = []
  for (const raw of body.productIds.slice(0, MAX_CART_PRODUCTS)) {
    const id = idOf(raw)
    if (id !== null && !productIds.includes(id)) productIds.push(id)
  }
  if (productIds.length === 0) return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })

  const engine = (await getEngine()) as unknown as Engine
  const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
  if (settings?.crossSellsInCart === false) return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })

  const { docs: cartDocs } = await engine
    .find({ collection: 'products', where: { id: { in: productIds } }, limit: MAX_CART_PRODUCTS, depth: 0, overrideAccess: true })
    .catch((): { docs: Doc[] } => ({ docs: [] }))
  const cartById = new Map(cartDocs.filter((doc) => doc._status === 'published').map((doc) => [doc.id, doc]))
  const sources: CrossSellSource[] = productIds
    .filter((id) => cartById.has(id))
    .map((id) => ({
      productId: id,
      crossSellIds: (Array.isArray(cartById.get(id)?.crossSells) ? (cartById.get(id)?.crossSells as unknown[]) : []).map(idOf).filter((v): v is number => v !== null),
    }))
  const suggestedIds = [...new Set(sources.flatMap((source) => source.crossSellIds))].slice(0, 200)
  if (suggestedIds.length === 0) return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })

  const { docs: candidateDocs } = await engine
    .find({ collection: 'products', where: { and: [{ _status: { equals: 'published' } }, { id: { in: suggestedIds } }] }, limit: 200, depth: 1, overrideAccess: true })
    .catch((): { docs: Doc[] } => ({ docs: [] }))
  const candidateById = new Map(candidateDocs.map((doc) => [doc.id, doc]))
  const candidates: CrossSellCandidate[] = candidateDocs.map((doc) => ({
    id: doc.id,
    published: doc._status === 'published',
    inStock: computeStockStatus(doc as never) !== 'outofstock',
  }))

  const ids = pickCrossSells({ cartProductIds: productIds, sources, candidates, limit: CROSS_SELL_LIMIT })
  const cards = ids.map((id) => candidateById.get(id)).filter((doc): doc is Doc => Boolean(doc)).map(cardFor)
  return NextResponse.json(cards, { headers: { 'Cache-Control': 'no-store' } })
}
