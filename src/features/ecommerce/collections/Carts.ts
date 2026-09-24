import type { CollectionConfig } from '@/engine'

import { hasCartSecretAccess, isAdmin, isAuthenticated, isDocumentOwner, isGuest } from '@/access/ecommerceAccess'

import { beforeChangeCart, cartStatusAfterRead } from '../hooks/cartHooks'
import { cartItemsField, currencyField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `carts` collection - see
 * ./Products.ts's header comment. Reproduced from `createCartsCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`) with this app's own
 * `allowGuestCarts: true` (`engage.config.ts`'s `carts:` key).
 *
 * LAYER 2 (this stage) added: `secret`'s auto-generation and the
 * `beforeChangeCart` subtotal recalculation (`../hooks/cartHooks.ts`,
 * `beforeChange` hook), and the cart-secret-based guest access path
 * (`hasCartSecretAccess`, `@/access/ecommerceAccess`) - `access` below now
 * covers admin/owner/guest-by-secret, matching the real plugin's
 * `accessOR(isAdmin, isDocumentOwner, hasCartSecretAccess(allowGuestCarts))`.
 *
 * Also added (2026-09-24, Layer 2 remainder): the 5 custom cart endpoints
 * (add-item/remove-item/update-item/clear/merge) as this app's own REST
 * routes - `src/localapi/rest.ts`'s dispatcher now handles
 * `POST /api/carts/:id/<action>` itself (`handleCartAddItem` etc.), reusing
 * this collection's own `access`/`hooks` above via the same
 * `engine.findByID`/`update`/`delete` calls every other cart request goes
 * through - reproduced from the real plugin's `collections/carts/
 * endpoints/*.js` + `operations/*.js`, simplified for this app's `variants:
 * false` shop config (no variant matching, no extra item fields).
 *
 * Also added (2026-09-24, closing out Layer 2): the `status` field. Earlier
 * notes here assumed this needed a COLLECTION-level `afterRead` hook this
 * app's engine doesn't support - wrong: the real plugin's own `status` field
 * (`createCartsCollection.js`) is a plain FIELD-level `afterRead` hook
 * (`statusBeforeRead.js`, reproduced verbatim as `cartStatusAfterRead` in
 * `../hooks/cartHooks.ts`), which this engine already ran generically for
 * any field that declares one (`src/localapi/read-operations.ts`'s
 * `traverseField`) - no engine change needed there. `virtual: true` (real
 * Payload's own flag) DID need one: `src/cms/db/schema/generate.ts` now
 * skips any `virtual` field when building columns, matching real Payload's
 * own "no DB column for a virtual field" behavior - required because this
 * shadow schema is bound to the SAME physical `eg_carts` table real
 * Payload's own (already-migrated) plugin config created, which also has no
 * `status` column; without that skip this shadow table would drift from the
 * real one and break at the first query.
 *
 * Layer 2 is now fully done. Remaining ecommerce work is Layer 3 (Stripe)
 * and the real plugin cutover - see payload-removal-plan.md.
 */
export const Carts: CollectionConfig = {
  slug: 'carts',
  dbName: 'eg_carts',
  labels: { singular: 'Cart', plural: 'Carts' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'createdAt',
  },
  access: {
    // allowGuestCarts is always true in this app (engage.config.ts) - a
    // signed-out request is always allowed to create its own cart, same as
    // the real plugin's `accessOR(isAdmin, isAuthenticated,
    // conditional(allowGuestCarts, isGuest))`.
    create: (args) => isAdmin(args) || isAuthenticated(args) || isGuest(args),
    read: (args) => isAdmin(args) || isDocumentOwner(args) || hasCartSecretAccess(args),
    update: (args) => isAdmin(args) || isDocumentOwner(args) || hasCartSecretAccess(args),
    delete: (args) => isAdmin(args) || isDocumentOwner(args) || hasCartSecretAccess(args),
  },
  hooks: {
    beforeChange: [beforeChangeCart],
  },
  timestamps: true,
  fields: [
    cartItemsField('items'),
    {
      name: 'secret',
      type: 'text',
      index: true,
      // Never editable by a client and never returned to an authenticated
      // admin/owner request - but visible on a GUEST request (`!req.user`),
      // which is what lets the create response (always a guest request when
      // a secret is actually generated - see cartHooks.ts) hand the secret
      // back the one time the caller doesn't already have it, and lets a
      // guest's later `?secret=` requests keep confirming it. Matches the
      // real plugin's one-time-reveal intent without needing this app's
      // engine to support the collection-level `afterRead` hook the real
      // plugin uses to do that same reveal (see the header comment above).
      access: { create: () => false, read: ({ req }) => !req.user, update: () => false },
      admin: { hidden: true, position: 'sidebar', readOnly: true },
    },
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar' } },
    { name: 'purchasedAt', type: 'date', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'status',
      type: 'select',
      virtual: true,
      hooks: { afterRead: [cartStatusAfterRead] },
      admin: { position: 'sidebar', readOnly: true },
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Purchased', value: 'purchased' },
        { label: 'Abandoned', value: 'abandoned' },
      ],
    },
    {
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [{ name: 'subtotal', type: 'number' }, currencyField],
    },
  ],
}
