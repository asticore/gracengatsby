import { summariseRatings } from './reviews'

type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Array<Record<string, unknown>> }>
}

/**
 * Recomputes the cached `ratingAverage` / `ratingCount` on a product from its approved reviews.
 * Written straight to the live row: it is derived data, not an edit, so it must not create a
 * version, change authorship or re-run the publish guards. Never throws - a failed refresh must
 * not undo the moderation action that triggered it.
 */
export async function refreshRatingSummary(engine: unknown, productId: number): Promise<void> {
  try {
    const { docs } = await (engine as EngineLike).find({
      collection: 'product-reviews',
      where: { and: [{ product: { equals: productId } }, { status: { equals: 'approved' } }] },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    const summary = summariseRatings(docs as Array<{ rating?: number | null; status?: string | null }>)
    const { updateProductLiveRow } = await import('@/cms/db/collections/products')
    await updateProductLiveRow(productId, { ratingAverage: summary.average, ratingCount: summary.count } as never)
  } catch (error) {
    console.error('[reviews] could not refresh the rating summary', error)
  }
}
