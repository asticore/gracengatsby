import type { CollectionConfig, CollectionSlug } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

/**
 * Back-in-stock sign-ups: someone asked to be emailed when an out-of-stock product (or variation) is
 * back. Created only by POST /api/shop-back-in-stock (rate limited, honeypot, one pending row per
 * person and item), which the server writes with overrideAccess. Staff can read and remove them;
 * nothing edits them by hand. Addresses are personal data, so they are never returned to shoppers.
 */
export const StockSubscriptions: CollectionConfig = {
  slug: 'stock-subscriptions',
  dbName: 'eg_stock_subscriptions',
  labels: { singular: 'Back-in-stock sign-up', plural: 'Back-in-stock sign-ups' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'email',
    defaultColumns: ['email', 'product', 'status', 'createdAt', 'notifiedAt'],
    description: 'People waiting to hear when an out-of-stock product is back. Each one is emailed once, then marked Sent.',
  },
  access: {
    create: () => false,
    read: roleAccess('stock-subscriptions', 'read'),
    update: () => false,
    delete: roleAccess('stock-subscriptions', 'delete'),
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products' as CollectionSlug, required: true, index: true, admin: { position: 'sidebar', readOnly: true } },
    { name: 'variation', type: 'text', admin: { readOnly: true, description: 'Which variation was asked for. Empty for a single product.' } },
    { name: 'email', type: 'email', required: true, admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Pending waits for stock. Sent means the email has gone.' },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Sent', value: 'sent' },
      ],
    },
    { name: 'notifiedAt', type: 'date', admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
  ],
}