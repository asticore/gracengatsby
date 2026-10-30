import type { CollectionConfig, CollectionSlug } from '@/engine'

import { webhookOrderAfterChange } from '@/features/webhooks/hooks'
import { adminOnlyFieldAccess } from '@/access/ecommerceAccess'

import { ordersAccess, staffFieldAccess } from '../access'
import { ORDER_STATUSES, ORDER_STATUS_LABELS, transitionError } from '../lib/orderStatus'
import { currencyField, orderItemsField } from './shared'

/**
 * Orders. Money is whole CENTS here (unlike product prices, which are dollars):
 * `amount` is the grand total, and `subtotal`/`discountTotal`/`shippingTotal`/
 * `taxTotal`/`refundedTotal` are its parts. Everything is computed on the
 * server from database prices (../server/pricing.ts); the admin fields are
 * read-only so a total is never hand-typed.
 *
 * Access: admins and roles with `orders.*` permissions, plus a customer READING
 * their own orders only (`customer` = their id). Internal notes, payment ids
 * and bookkeeping flags are staff-only at field level, so a customer reading
 * their own order never sees them.
 *
 * Status moves are checked against the transition map (../lib/orderStatus.ts);
 * the order edit page carries Notes, Refunds and Invoice panels (ui fields).
 */
export const Orders: CollectionConfig = {
  slug: 'orders',
  dbName: 'eg_orders',
  labels: { singular: 'Order', plural: 'Orders' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'createdAt',
    defaultColumns: ['id', 'status', 'customerEmail', 'amount', 'createdAt'],
  },
  access: {
    create: ordersAccess('create'),
    read: ordersAccess('read'),
    update: ordersAccess('update'),
    delete: ordersAccess('delete'),
  },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc, operation }) => {
        if (!data) return data
        // A new order gets its number here, once. An existing number is never replaced.
        if (operation === 'create' && !data.orderNumber) {
          const { rawD1 } = await import('../server/db')
          const { nextOrderNumber } = await import('../numbering')
          data.orderNumber = await nextOrderNumber(await rawD1())
        }
        if (typeof data.status !== 'string') return data
        if (operation === 'update') {
          const from = (originalDoc as { status?: string } | undefined)?.status
          const problem = transitionError(from, data.status)
          if (problem) throw new Error(problem)
        }
        return data
      },
    ],
    afterChange: [
      async (args) => {
        const { runOrderAfterChange } = await import('../server/orderHooks')
        return runOrderAfterChange(args as never)
      },
      webhookOrderAfterChange,
    ],
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
      // 'transactions' is not in the engine's generated CollectionSlug union;
      // see Transactions.ts for why this shadow config can cast it.
      relationTo: 'transactions' as CollectionSlug,
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
      admin: { position: 'sidebar', description: 'Moves are limited to the allowed transitions (for example, a refunded order is final).' },
      defaultValue: 'pending',
      options: ORDER_STATUSES.map((value) => ({ label: ORDER_STATUS_LABELS[value], value })),
    },
    { name: 'amount', type: 'number', admin: { position: 'sidebar', readOnly: true, description: 'Grand total, in cents.' } },
    currencyField,
    {
      type: 'row',
      fields: [
        { name: 'subtotal', type: 'number', admin: { readOnly: true, description: 'Cents.' } },
        { name: 'discountTotal', type: 'number', admin: { readOnly: true } },
        { name: 'shippingTotal', type: 'number', admin: { readOnly: true } },
        { name: 'taxTotal', type: 'number', admin: { readOnly: true } },
        { name: 'refundedTotal', type: 'number', defaultValue: 0, admin: { readOnly: true } },
      ],
    },
    { name: 'pricesIncludeTax', type: 'checkbox', defaultValue: true, admin: { readOnly: true } },
    { name: 'shippingMethod', type: 'json', admin: { readOnly: true } },
    { name: 'taxLines', type: 'json', admin: { readOnly: true } },
    { name: 'couponLines', type: 'json', admin: { readOnly: true } },
    { name: 'lineItems', type: 'json', admin: { readOnly: true, description: 'Prices and names as they were when the order was placed.' } },
    { name: 'preorderPanel', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/PreorderOrderPanel#PreorderOrderPanel' } } },
    { name: 'checkoutFields', type: 'json', admin: { readOnly: true, description: 'Answers to the optional checkout fields.' } },
    { name: 'customerNote', type: 'textarea', admin: { readOnly: true } },
    { name: 'paidAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    {
      name: 'notes',
      type: 'json',
      admin: { hidden: true },
      access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess },
    },
    {
      name: 'paymentIntentId',
      type: 'text',
      index: true,
      admin: { hidden: true },
      access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess },
    },
    {
      name: 'paypalOrderId',
      type: 'text',
      index: true,
      admin: { hidden: true },
      access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess },
    },
    {
      name: 'paypalCaptureId',
      type: 'text',
      admin: { hidden: true },
      access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess },
    },
    {
      name: 'cartId',
      type: 'number',
      index: true,
      admin: { hidden: true },
      access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess },
    },
    { name: 'orderNumber', type: 'text', index: true, admin: { position: 'sidebar', readOnly: true, description: 'The number shown to the customer.' } },
    { name: 'invoiceNumber', type: 'text', admin: { position: 'sidebar', readOnly: true } },
    { name: 'giftCardTotal', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Cents paid with gift cards.' } },
    { name: 'storeCreditTotal', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Cents paid with store credit.' } },
    { name: 'storedValue', type: 'json', admin: { hidden: true }, access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess } },
    { name: 'storedValueApplied', type: 'checkbox', defaultValue: false, admin: { hidden: true }, access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess } },
    { name: 'giftCardsIssued', type: 'checkbox', defaultValue: false, admin: { hidden: true }, access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess } },
    { name: 'shipments', type: 'json', admin: { readOnly: true, description: 'Labels bought for this order: carrier, tracking number, label link.' } },
    { name: 'trackingNumber', type: 'text', admin: { position: 'sidebar', description: 'Shown to the customer in the shipped email.' } },
    { name: 'trackingCarrier', type: 'text', admin: { position: 'sidebar' } },
    { name: 'trackingUrl', type: 'text', admin: { position: 'sidebar' } },
    { name: 'shippedAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'couponUsageApplied', type: 'checkbox', defaultValue: false, admin: { hidden: true }, access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess } },
    { name: 'stockAdjusted', type: 'checkbox', defaultValue: false, admin: { hidden: true }, access: { create: staffFieldAccess, read: staffFieldAccess, update: staffFieldAccess } },
    {
      type: 'collapsible',
      label: 'Notes',
      fields: [{ name: 'notesPanel', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/OrderPanels#OrderNotesPanel' } } }],
    },
    {
      type: 'collapsible',
      label: 'Refunds',
      fields: [{ name: 'refundsPanel', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/OrderPanels#OrderRefundsPanel' } } }],
    },
    {
      type: 'collapsible',
      label: 'Shipping labels',
      fields: [{ name: 'shippingPanel', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/OrderPanels#OrderShippingPanel' } } }],
    },
    {
      type: 'collapsible',
      label: 'Invoice and packing slip',
      fields: [{ name: 'invoicePanel', type: 'ui', admin: { components: { Field: '@/features/ecommerce/admin/OrderPanels#OrderInvoicePanel' } } }],
    },
  ],
}
