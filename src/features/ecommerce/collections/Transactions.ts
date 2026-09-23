import type { CollectionConfig } from '@/engine'

import { isAdmin, isCustomer } from '@/access/ecommerceAccess'

import { currencyField, transactionItemsField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `transactions` collection - see
 * ./Products.ts's header comment. Reproduced from `createTransactionsCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`).
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping): the `beforeChangeTransaction`
 * hook that creates a Stripe PaymentIntent and binds it to this row, and all
 * Stripe client-side integration (the `stripe` subfield is stored but not
 * created/updated server-side at the data layer yet).
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
    create: (args) => isAdmin(args) || isCustomer(args),
    read: (args) => isAdmin(args) || isCustomer(args),
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