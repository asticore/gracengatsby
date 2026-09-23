import type { CollectionConfig } from '@/engine'

import { isAdmin, isCustomer } from '@/access/ecommerceAccess'

/**
 * SHADOW config for the ecommerce plugin's real `addresses` collection - see
 * ./Products.ts's header comment. Reproduced from `createAddressesCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`).
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping): address book features like
 * multiple addresses per customer, edit/delete endpoints, set-default logic.
 */
export const Addresses: CollectionConfig = {
  slug: 'addresses',
  dbName: 'eg_addresses',
  labels: { singular: 'Address', plural: 'Addresses' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'addressLine1',
  },
  access: {
    create: (args) => isAdmin(args) || isCustomer(args),
    read: (args) => isAdmin(args) || isCustomer(args),
    update: (args) => isAdmin(args) || isCustomer(args),
    delete: (args) => isAdmin(args) || isCustomer(args),
  },
  timestamps: true,
  fields: [
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar' } },
    { name: 'title', type: 'text', admin: { position: 'sidebar' } },
    { name: 'firstName', type: 'text' },
    { name: 'lastName', type: 'text' },
    { name: 'company', type: 'text' },
    { name: 'addressLine1', type: 'text', required: true },
    { name: 'addressLine2', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'state', type: 'text' },
    { name: 'postalCode', type: 'text' },
    {
      name: 'country',
      type: 'select',
      required: true,
      options: [
        { label: 'United States', value: 'US' },
        { label: 'Australia', value: 'AU' },
        { label: 'Canada', value: 'CA' },
        { label: 'United Kingdom', value: 'UK' },
      ],
    },
    { name: 'phone', type: 'text' },
  ],
}
