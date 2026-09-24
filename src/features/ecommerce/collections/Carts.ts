import type { CollectionConfig } from '@/engine'

import { hasCartSecretAccess, isAdmin, isAuthenticated, isDocumentOwner, isGuest } from '@/access/ecommerceAccess'

import { beforeChangeCart } from '../hooks/cartHooks'
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
 * DELIBERATELY NOT MODELED HERE (Layer 2 remainder / Layer 3 - see
 * payload-removal-plan.md's Ecommerce scoping):
 *  - `status` (virtual, computed by an `afterRead` hook from
 *    `purchasedAt`/`createdAt` - never a real column, confirmed against the
 *    real `eg_carts` schema, which has no `status` column at all; also, this
 *    app's own engine has no collection-level `afterRead`/virtual-field
 *    support yet, so this would need an engine change, not just a config
 *    one - see `src/localapi/operations.ts`).
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
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [{ name: 'subtotal', type: 'number' }, currencyField],
    },
  ],
}
