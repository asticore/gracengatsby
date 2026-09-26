import type { CollectionConfig } from '@/engine'

import { isAdmin, isDocumentOwner } from '@/access/ecommerceAccess'

import { currencyField, transactionItemsField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `transactions` collection - see
 * ./Products.ts's header comment. Reproduced from `createTransactionsCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`, read directly all 155 lines, plus
 * checked for a `hooks/` subdirectory under this plugin version's
 * `dist/collections/transactions/` - none exists, same false-premise pattern
 * already found and corrected on Orders.ts/Products.ts. There was never a
 * `beforeChangeTransaction` PaymentIntent-creation hook to defer - real
 * Payload doesn't have one in this plugin version. `stripeAdapter.ts`'s
 * `initiateStripePayment`/`confirmStripeOrder` already create/update this
 * collection's rows directly (both via `overrideAccess: true`), which is
 * this app's already-working equivalent. Nothing to port.
 *
 * Ecommerce cutover (Transactions gap, 2026-09-26): found the same
 * role-only-not-ownership access bug that already hit Addresses.ts/Orders.ts.
 * `read` was `isAdmin || isCustomer` - `isCustomer` only checks the caller's
 * ROLE (any authenticated non-admin), not whether THIS transaction belongs to
 * them. Any signed-in customer could `GET /api/transactions` (or fetch by id)
 * and read every OTHER customer's payment records: Stripe customer/
 * PaymentIntent ids, billing address, amount, linked order/cart. Real
 * Payload's own access (`createTransactionsCollection.js:126-131`) is
 * actually `isAdmin`-only for ALL four operations - stricter than this
 * shadow's intent of letting a customer see their own receipt. Fixed `read`
 * to `isDocumentOwner` (own transactions only, matching the `customer`
 * relationship field the same way Orders.ts does) rather than tightening all
 * the way to admin-only, since a customer legitimately needs to read their
 * own transaction/receipt and no current code path exercises that read with
 * `overrideAccess: true` on their behalf. Also tightened `create` to
 * `isAdmin`-only, matching the real plugin exactly - checked every write site
 * (`stripeAdapter.ts`'s `initiateStripePayment`) and confirmed it already
 * calls `engine.create` with `overrideAccess: true`, so this is a pure
 * tightening with zero behavior change for existing code paths (a customer
 * was never actually creating a transaction directly through this access
 * function to begin with). `update`/`delete` were already correct
 * (`isAdmin`-only, matching the real plugin).
 */
export const Transactions: CollectionConfig = {
  slug: 'transactions',
  dbName: 'eg_transactions',
  labels: { singular: 'Transaction', plural: 'Transactions' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'createdAt',
  },
  access: {
    create: isAdmin,
    read: (args) => isAdmin(args) || isDocumentOwner(args),
    update: isAdmin,
    delete: isAdmin,
  },
  timestamps: true,
  fields: [
    transactionItemsField('items'),
    { name: 'paymentMethod', type: 'text' },
    {
      type: 'group',
      name: 'stripe',
      label: 'Stripe',
      fields: [
        { name: 'customerID', type: 'text', index: true },
        { name: 'paymentIntentID', type: 'text', index: true },
      ],
    },
    {
      type: 'group',
      name: 'billingAddress',
      label: 'Billing Address',
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
    { name: 'status', type: 'text', required: true },
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar' } },
    { name: 'customerEmail', type: 'email', admin: { position: 'sidebar' } },
    { name: 'order', type: 'relationship', relationTo: 'orders', admin: { position: 'sidebar' } },
    { name: 'cart', type: 'relationship', relationTo: 'carts', admin: { position: 'sidebar' } },
    { name: 'amount', type: 'number', admin: { position: 'sidebar' } },
    currencyField,
  ],
}
