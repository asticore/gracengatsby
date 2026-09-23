import type { CollectionConfig } from '@/engine'

import { isAdmin, isCustomer } from '@/access/ecommerceAccess'

import { currencyField, orderItemsField } from './shared'

/**
 * SHADOW config for the ecommerce plugin's real `orders` collection - see
 * ./Products.ts's header comment. Reproduced from `createOrdersCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`).
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping): the complex `stripeWebhook`
 * `beforeChange` hook that validates/updates order state based on stripe
 * events, and the related `sendOrderEmail`/`sendDigitalAccessEmail` hooks.
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
    read: (args) => isAdmin(args) || isCustomer(args),
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
    { name: 'transactions', type: 'relationship', relationTo: 'transactions', hasMany: true, admin: { position: 'sidebar' } },
    { name: 'status', type: 'text', admin: { position: 'sidebar' } },
    { name: 'amount', type: 'number', admin: { position: 'sidebar' } },
    currencyField,
  ],
}