import type { CollectionConfig, CollectionSlug } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'
import { resolveAccess } from '@/features/roles/permissions'

import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUSES } from '../subscriptions/plan'

type U = { id?: number | string; roles?: string[] } | null | undefined

/**
 * Read: staff with the permission see every subscription; a signed-in customer sees only their own
 * (`customer` is their id). Nobody creates these by hand: Stripe webhooks and the shop's own checkout
 * write them (with overrideAccess). Changes to a subscription go through Stripe, see subscriptions/manage.ts.
 */
const readAccess = ({ req }: { req: { user?: unknown } }) => {
  const user = req.user as U
  if (user?.roles?.includes('admin')) return true
  if (!user) return false
  if (resolveAccess(user as never, 'product-subscriptions', 'read') === 'all') return true
  return { customer: { equals: user.id } }
}

/**
 * Recurring payments for products sold as subscriptions. One row per subscription, kept up to date from
 * Stripe: status, next payment, how many payments were taken, and a history of what happened.
 * Stripe's ids are kept so the webhook can find the row. Staff cancel, pause and resume from the edit screen.
 */
export const ProductSubscriptions: CollectionConfig = {
  slug: 'product-subscriptions',
  dbName: 'eg_product_subscriptions',
  labels: { singular: 'Subscription', plural: 'Subscriptions' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'productName',
    defaultColumns: ['productName', 'customerEmail', 'status', 'nextPaymentAt', 'paymentsMade', 'createdAt'],
    description: 'Products bought as a repeating payment. Pause, resume or cancel from the edit screen; cancelling ends it at the end of the paid period.',
  },
  access: {
    create: () => false,
    read: readAccess,
    update: () => false,
    delete: roleAccess('product-subscriptions', 'delete'),
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      name: 'statusPanel',
      type: 'ui',
      admin: { components: { Field: '@/features/ecommerce/subscriptions/admin/SubscriptionAdminPanel#SubscriptionAdminPanel' } },
    },
    { name: 'customer', type: 'relationship', relationTo: 'users' as CollectionSlug, index: true, admin: { position: 'sidebar', readOnly: true } },
    { name: 'customerEmail', type: 'email', index: true, admin: { position: 'sidebar', readOnly: true } },
    { name: 'product', type: 'relationship', relationTo: 'products' as CollectionSlug, required: true, index: true, admin: { position: 'sidebar', readOnly: true } },
    { name: 'productName', type: 'text', admin: { readOnly: true, description: 'The product name when the subscription started.' } },
    {
      name: 'status',
      type: 'select',
      index: true,
      defaultValue: 'incomplete',
      admin: { position: 'sidebar', readOnly: true, description: 'Where the subscription is now. Kept up to date from Stripe.' },
      options: SUBSCRIPTION_STATUSES.map((value) => ({ label: SUBSCRIPTION_STATUS_LABELS[value], value })),
    },
    {
      type: 'row',
      fields: [
        { name: 'amountCents', type: 'number', admin: { width: '34%', readOnly: true, description: 'Price per payment, in cents. Set when the subscription started.' } },
        { name: 'currency', type: 'text', admin: { width: '33%', readOnly: true } },
        { name: 'paymentsMade', type: 'number', defaultValue: 0, admin: { width: '33%', readOnly: true, description: 'Payments taken so far, not counting a free trial.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'billingInterval', type: 'text', admin: { width: '34%', readOnly: true, description: 'Unit of the billing period: day, week, month or year.' } },
        { name: 'billingIntervalCount', type: 'number', admin: { width: '33%', readOnly: true, description: 'How many of those units make one period.' } },
        { name: 'paymentsLimit', type: 'number', defaultValue: 0, admin: { width: '33%', readOnly: true, description: '0 means it runs until cancelled.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startedAt', type: 'date', admin: { width: '25%', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'trialEndsAt', type: 'date', admin: { width: '25%', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'nextPaymentAt', type: 'date', admin: { width: '25%', readOnly: true, date: { pickerAppearance: 'dayAndTime' }, description: 'End of the current period, when the next payment is taken (unless paused or cancelled).' } },
        { name: 'cancelledAt', type: 'date', admin: { width: '25%', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    { name: 'endedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'stripeCustomerId', type: 'text', index: true, admin: { readOnly: true, description: 'The Stripe customer id, for matching in the Stripe dashboard.' } },
    { name: 'stripeSubscriptionId', type: 'text', index: true, admin: { readOnly: true, description: 'The Stripe subscription id.' } },
    { name: 'stripePriceId', type: 'text', admin: { readOnly: true } },
    { name: 'history', type: 'json', admin: { readOnly: true, description: 'What happened, oldest first: payments, status changes and changes made by staff or the customer.' } },
  ],
}
