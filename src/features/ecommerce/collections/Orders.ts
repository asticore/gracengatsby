import type { CollectionConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin, isDocumentOwner } from '@/access/ecommerceAccess'

import { currencyField, orderItemsField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `orders` collection - see
 * ./Products.ts's header comment. Reproduced from `createOrdersCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`, read directly from
 * `node_modules/.pnpm/.../dist/collections/orders/createOrdersCollection.js` -
 * there is no `hooks/` subdirectory under `dist/collections/orders/` at all
 * in this plugin version, so `stripeWebhook`/`sendOrderEmail`/
 * `sendDigitalAccessEmail` hooks this file's comment used to cite as
 * "deferred" don't exist to defer - they were never real. Nothing to model
 * there.).
 *
 * Ecommerce cutover (Orders gap, 2026-09-26): same access-control bug shape
 * as `./Addresses.ts` - `read` used to be `isAdmin || isCustomer`, and
 * `isCustomer` only checks the caller's ROLE (any authenticated non-admin),
 * not whether THIS order belongs to them. Any signed-in customer could list
 * or fetch-by-id every OTHER customer's orders (shipping address, line
 * items, amount, linked transaction ids). Real Payload's own access is
 * `accessOR(isAdmin, isDocumentOwner)` - fixed to match. `create`/`update`/
 * `delete` were already correct (`isAdmin`-only, matching the real plugin
 * exactly).
 *
 * Also matched real Payload's own field-level lockdown on `transactions`
 * (`adminOnlyFieldAccess` for create/read/update) - a customer reading their
 * own order via REST shouldn't see the linked internal `transactions`
 * relationship ids either; only admins should. Checked: no customer-facing
 * code in this app reads `order.transactions` (only server-side writes with
 * `overrideAccess: true`, which skip field access entirely).
 *
 * `status` was a plain `text` field here; real Payload defines it as a
 * `select` with exactly 4 options (`processing`/`completed`/`cancelled`/
 * `refunded`) and `defaultValue: 'processing'`. Converted to match - checked
 * every place in this app that writes or queries an order's `status`
 * (`stripeAdapter.ts`, `entitlement.ts`'s `PAID_ORDER_STATUSES`, both
 * `selfTest.mts` files) and all of them already only ever use `'processing'`
 * or `'completed'`, both valid options, so this is a pure tightening with no
 * behavior change for existing code paths.
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  dbName: 'eg_orders',
  labels: { singular: 'Order', plural: 'Orders' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'createdAt',
  },
  access: {
    create: (args) => isAdmin(args),
    read: (args) => isAdmin(args) || isDocumentOwner(args),
    update: (args) => isAdmin(args),
    delete: (args) => isAdmin(args),
  },
  timestamps: true,
  fields: [
    orderItemsField('items'),
    {
      type: 'group',
      name: 'shippingAddress',
      label: 'Shipping Address',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'firstName', type: 'text' },
        { name: 'lastName', type: 'text' },
        { name: 'company', type: 'text' },
        { name: 'addressLine1', type: 'text' },
        { name: 'addressLine2', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'state', type: 'text' },
        { name: 'postalCode', type: 'text' },
        { name: 'country', type: 'text' },
        { name: 'phone', type: 'text' },
      ],
    },
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar' } },
    { name: 'customerEmail', type: 'email', admin: { position: 'sidebar' } },
    {
      name: 'transactions',
      type: 'relationship',
      relationTo: 'transactions',
      hasMany: true,
      admin: { position: 'sidebar' },
      access: {
        create: adminOnlyFieldAccess,
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
    },
    {
      name: 'status',
      type: 'select',
      admin: { position: 'sidebar' },
      defaultValue: 'processing',
      options: [
        { label: 'Processing', value: 'processing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Cancelled', value: 'cancelled' },
        { label: 'Refunded', value: 'refunded' },
      ],
    },
    { name: 'amount', type: 'number', admin: { position: 'sidebar' } },
    currencyField,
  ],
}