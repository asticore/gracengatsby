import type { CollectionConfig } from '@/engine'

import { isAdmin, isAuthenticated, isDocumentOwner } from '@/access/ecommerceAccess'

import { cartItemsField, currencyField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `carts` collection - see
 * ./Products.ts's header comment. Reproduced from `createCartsCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`) with this app's own
 * `allowGuestCarts: true` (`engage.config.ts`'s `carts:` key).
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping):
 *  - `status` (virtual, computed by an `afterRead` hook from
 *    `purchasedAt`/`createdAt` - never a real column, confirmed against the
 *    real `eg_carts` schema, which has no `status` column at all).
 *  - `secret`'s auto-generation and the `beforeChangeCart` subtotal
 *    recalculation (both `beforeChange` hooks).
 *  - The 5 custom cart endpoints (add-item/remove-item/update-item/clear/
 *    merge-cart) and the cart-secret-based guest access path
 *    (`hasCartSecretAccess`) - `access` below covers the admin/owner case
 *    only; a signed-out guest's own cart (matched by the `secret` cookie/
 *    header, not `req.user`) is NOT yet reachable through this registry
 *    entry until Layer 2 lands.
 *
 * `secret` itself IS modeled (real column, `carts.secret`) even though its
 * generation hook isn't - so the column exists and round-trips like any
 * other field once Layer 2 supplies a value for it.
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
    create: (args) => isAdmin(args) || isAuthenticated(args),
    read: (args) => isAdmin(args) || isDocumentOwner(args),
    update: (args) => isAdmin(args) || isDocumentOwner(args),
    delete: (args) => isAdmin(args) || isDocumentOwner(args),
  },
  timestamps: true,
  fields: [
    cartItemsField('items'),
    {
      name: 'secret',
      type: 'text',
      index: true,
      access: { create: () => false, read: () => false, update: () => false },
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