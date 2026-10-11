import type { CollectionConfig, CollectionSlug } from '@/engine'

import { shopAccess } from '../access'

/**
 * A refund against an order. Creating one (from the order's Refunds panel, or
 * directly) runs the whole refund: amount limits, provider call, order totals,
 * restock and customer email - see ../server/refunds.ts. Rows are never edited
 * or deleted afterwards (they are the audit trail).
 */
export const OrderRefunds: CollectionConfig = {
  slug: 'order-refunds',
  dbName: 'eg_order_refunds',
  labels: { singular: 'Order refund', plural: 'Order refunds' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'reason',
    defaultColumns: ['order', 'amount', 'method', 'status', 'createdAt'],
    description: 'Refunds issued against orders. Create them from the order page.',
  },
  access: {
    create: shopAccess('order-refunds', 'create'),
    read: shopAccess('order-refunds', 'read'),
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  hooks: {
    beforeChange: [
      async (args) => {
        const { runRefundBeforeChange } = await import('../server/refunds')
        return runRefundBeforeChange(args as never)
      },
    ],
    afterChange: [
      async (args) => {
        const { runRefundAfterChange } = await import('../server/refunds')
        return runRefundAfterChange(args as never)
      },
    ],
  },
  fields: [
    { name: 'order', type: 'relationship', relationTo: 'orders' as CollectionSlug, required: true, index: true },
    { name: 'amount', type: 'number', required: true, min: 1, admin: { description: 'In cents (1000 = $10.00). Never more than is left to refund.' } },
    { name: 'reason', type: 'text' },
    { name: 'items', type: 'json', admin: { description: 'Optional: [{"index":0,"quantity":1}] - line items (by position) this refund covers, used for restocking.' } },
    { name: 'restock', type: 'checkbox', defaultValue: false, admin: { description: 'Return the refunded items to stock.' } },
    {
      name: 'method',
      type: 'select',
      defaultValue: 'auto',
      options: [
        { label: 'Automatic (card refund if paid by card)', value: 'auto' },
        { label: 'Manual (record only)', value: 'manual' },
      ],
      admin: { description: 'Manual records the refund without moving money - use it when you refunded outside the shop.' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'completed',
      options: [
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { readOnly: true, position: 'sidebar' },
    },
    { name: 'providerRefundId', type: 'text', admin: { readOnly: true, position: 'sidebar' } },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { readOnly: true, position: 'sidebar' } },
  ],
}
