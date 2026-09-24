/**
 * Cart-specific hooks (Stage 10 Ecommerce, Layer 2 - see
 * payload-removal-plan.md). Reproduced from the real ecommerce plugin's
 * `beforeChange.js` (`@payloadcms/plugin-ecommerce@3.88.0`), simplified for
 * this app's single-currency (AUD-only) setup - no `priceIn${currency}`
 * lookup, no variants (`engage.config.ts`'s shop config has `variants:
 * false`).
 *
 * `req.payload` is this app's own `Engine` (see `../../../engine/index.ts`'s
 * header for why the hook's own type still names it `PayloadRequest` even
 * though the object handed in at runtime is ours) - `findByID` is one of the
 * methods the two share, so this reads the same as it would against real
 * Payload.
 */

import crypto from 'crypto'

type CartItem = { product?: number | { id: number } | null; quantity?: number | null }

/**
 * `beforeChange` on the Carts collection.
 *
 * - Generates a guest-access `secret` on creation, same as real Payload's
 *   `crypto.randomBytes(20).toString('hex')` - only when the cart has no
 *   `customer` (an authenticated user's cart doesn't need one; access is
 *   already `isDocumentOwner`).
 * - Recalculates `subtotal` from the current `items` array every save, so a
 *   client can never post its own total.
 */
// Untyped params deliberately (matches this repo's other inline collection
// hooks, e.g. Enrolments.ts's beforeChange) so this is assignable to
// whatever the real `BeforeChangeHook<any>` type from `@/engine`'s
// `CollectionConfig.hooks.beforeChange` array element actually is, without
// fighting real Payload's generated per-collection `findByID` overload
// (its return type is the named `Product` type, not a plain
// `Record<string, unknown>`) - the loose casts below get back to a shape
// this function can work with either way.
export const beforeChangeCart = async ({ data, operation, req }: Record<string, unknown> & { data: Record<string, unknown> }) => {
  if (operation === 'create' && !data.customer && !data.secret) {
    data.secret = crypto.randomBytes(20).toString('hex')
  }

  const items = data.items as CartItem[] | undefined
  if (Array.isArray(items)) {
    let subtotal = 0
    const payload = (req as { payload: { findByID: (args: { collection: string; id: number; depth?: number }) => Promise<unknown> } }).payload
    for (const item of items) {
      const productId: number | null | undefined =
        item.product && typeof item.product === 'object' ? item.product.id : (item.product as number | null | undefined)
      if (!productId || !item.quantity) continue
      const product = (await payload.findByID({ collection: 'products', id: productId, depth: 0 }).catch((): null => null)) as { priceInAUD?: number } | null
      const price = product?.priceInAUD
      if (typeof price === 'number') subtotal += price * item.quantity
    }
    data.subtotal = subtotal
  } else {
    data.subtotal = 0
  }

  return data
}
