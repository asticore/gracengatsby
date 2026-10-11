import type { Endpoint, EngineRequest } from '@/engine'

import { normalizeEmail } from './lib/email'
import { PAID_STATUSES } from './lib/orderStatus'
import { checkReview, REVIEW_RATE_LIMIT_PER_MINUTE, type ReviewInput } from './reviews'

/**
 * POST /api/product-reviews/submit - the public review form posts here.
 *
 * Rate limited per client, honeypot trapped, and every review lands as Pending: nothing shows on
 * the shop until staff approve it. The reviewer's email is stored for moderation and to flag a
 * verified owner (an order from that email containing the product), and is never returned.
 */

const json = (body: unknown, status: number, headers?: Record<string, string>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(headers || {}) } })

type FindResult = { docs: Array<Record<string, unknown>> }
type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<FindResult>
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  findGlobal: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

/** True when a PAID order placed with this email (compared normalised) contains the product. */
export async function isVerifiedOwner(engine: EngineLike, email: string, productId: number): Promise<boolean> {
  try {
    const target = normalizeEmail(email)
    if (!target) return false
    const { docs } = await engine.find({ collection: 'orders', where: { customerEmail: { like: `${target.slice(0, 1)}%` } }, limit: 200, depth: 0, sort: '-createdAt', overrideAccess: true })
    return docs.some((order) => {
      if (!PAID_STATUSES.includes(order.status as never) || normalizeEmail(order.customerEmail) !== target) return false
      const items = (order.items as Array<{ product?: number | { id: number } | null }> | undefined) ?? []
      return items.some((item) => (typeof item.product === 'object' && item.product ? item.product.id : item.product) === productId)
    })
  } catch {
    return false
  }
}

export const reviewEndpoint: Endpoint = {
  path: '/submit',
  method: 'post',
  handler: async (req: EngineRequest): Promise<Response> => {
    const engine = req.engine as unknown as EngineLike
    const { hit, clientKey } = await import('@/features/security/rateLimit')
    const decision = hit(`review:${clientKey(req as unknown as Request)}`, REVIEW_RATE_LIMIT_PER_MINUTE)
    if (decision.limited) {
      return json({ ok: false, message: 'Too many reviews. Please wait a moment and try again.' }, 429, { 'Retry-After': String(decision.retryAfterSeconds) })
    }

    const input = (await req.json?.().catch((): null => null)) as ReviewInput | null
    if (!input || typeof input !== 'object') return json({ ok: false, message: 'Invalid request.' }, 400)

    const checked = checkReview(input)
    // A bot gets the same answer as a person, and nothing is stored.
    if (checked.ok === false) {
      if (!('errors' in checked)) return json({ ok: true, message: 'Thank you. Your review will appear once it has been approved.' }, 200)
      return json({ ok: false, message: 'Please check the form.', errors: checked.errors }, 400)
    }
    const review = checked.review

    const settings = await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): null => null)
    if (settings && settings.reviewsEnabled === false) return json({ ok: false, message: 'Reviews are turned off.' }, 403)

    const product = await engine.findByID({ collection: 'products', id: review.product, depth: 0, overrideAccess: true }).catch((): null => null)
    if (!product || product._status !== 'published') return json({ ok: false, message: 'Unknown product.' }, 404)

    const existing = await engine.find({ collection: 'product-reviews', where: { product: { equals: review.product } }, limit: 1000, depth: 0, overrideAccess: true })
    const reviewer = normalizeEmail(review.email)
    if (existing.docs.some((doc) => normalizeEmail(doc.email) === reviewer)) return json({ ok: false, message: 'You have already reviewed this product.' }, 409)

    await engine.create({
      collection: 'product-reviews',
      data: { ...review, status: 'pending', verifiedOwner: await isVerifiedOwner(engine, review.email, review.product) },
      overrideAccess: true,
    })
    return json({ ok: true, message: 'Thank you. Your review will appear once it has been approved.' }, 201)
  },
}
