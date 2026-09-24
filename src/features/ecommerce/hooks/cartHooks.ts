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

/**
 * `status` field-level `afterRead` hook (Stage 10 Ecommerce, Layer 2
 * remainder). Reproduced verbatim from the real ecommerce plugin's
 * `statusBeforeRead.js`: `'purchased'` once `purchasedAt` is set, `'active'`
 * for a cart created within the last 7 days, otherwise `'abandoned'`.
 *
 * This is a plain FIELD-level hook, not a collection-level one - the
 * `status` field on `../collections/Carts.ts` declares `virtual: true` (no
 * DB column - see `src/cms/db/schema/generate.ts`'s virtual-field skip) plus
 * `hooks: {afterRead: [cartStatusAfterRead]}`, and this app's own engine
 * already runs field-level `afterRead` hooks generically for any field that
 * declares one (`src/localapi/read-operations.ts`'s `traverseField`) - no
 * engine change was needed for this, only for realizing the field didn't
 * need the (unsupported) COLLECTION-level `afterRead` this project's earlier
 * notes assumed it did.
 *
 * `data` here is the whole doc (siblings), matching real Payload's own
 * `AfterReadFieldHookArgs.data` - untyped for the same reason
 * `beforeChangeCart` above is.
 */
export const cartStatusAfterRead = ({ data }: { data?: Record<string, unknown> }): 'active' | 'purchased' | 'abandoned' => {
  if (data?.purchasedAt) return 'purchased'
  if (data?.createdAt) {
    const createdAt = new Date(data.createdAt as string).getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - createdAt < sevenDaysMs) return 'active'
  }
  return 'abandoned'
}
