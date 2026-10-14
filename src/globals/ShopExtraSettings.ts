import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Shop-wide switches that do not fit in Shop settings (eg_shop_settings is at the D1 limit of 100 columns, so new
 * toggles live here). Add a future toggle as a new top-level field; every reader treats a missing value as the default.
 */
export const ShopExtraSettings: GlobalConfig = {
  slug: 'shop-extra-settings',
  label: 'Shop switches',
  dbName: 'eg_shop_extra_settings',
  admin: {
    group: 'Settings',
    description: 'Shop-wide switches. Shown and edited on the Shop settings page.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'preordersEnabled',
      type: 'checkbox',
      label: 'Allow pre-orders in the shop',
      defaultValue: true,
      admin: {
        description:
          'Allow pre-orders across the whole shop. Turn this off to stop selling pre-order products straight away: they show as out of stock and cannot be added to a cart. Products keep their pre-order settings, so turning it back on restores them.',
      },
    },
    {
      name: 'recommendationsEnabled',
      type: 'checkbox',
      label: 'Show product recommendations',
      defaultValue: false,
      admin: {
        description:
          'Show "Customers also bought" on product pages and under the cart items. Built from paid orders in the last 180 days; products in the same category fill any gap. Off by default.',
      },
    },
    {
      name: 'recommendationsMax',
      type: 'number',
      label: 'Most recommendations to show',
      defaultValue: 4,
      min: 1,
      admin: { description: 'How many products to suggest in each place. Between 1 and 12.' },
    },
    {
      name: 'addOnsEnabled',
      type: 'checkbox',
      label: 'Allow product add-ons',
      defaultValue: true,
      admin: {
        description: 'Show the add-on questions set on products (engraving, gift notes and so on) and price them at checkout. Turn off to hide them everywhere; products keep their add-ons.',
      },
    },
    {
      type: 'collapsible',
      label: 'Dynamic pricing rules',
      fields: [
        {
          name: 'pricingRulesEnabled',
          type: 'checkbox',
          label: 'Apply dynamic pricing rules',
          defaultValue: true,
          admin: { description: 'Apply the rules below at checkout. Turn off to stop every rule at once without deleting them.' },
        },
        {
          name: 'pricingRules',
          type: 'array',
          labels: { singular: 'Pricing rule', plural: 'Pricing rules' },
          admin: {
            description:
              'Discounts that apply across the shop: by quantity, customer role, cart subtotal or category, between set dates. Lower priority numbers are checked first. Discounts are applied before coupon codes. Rules that are not live yet or have ended do nothing.',
            initCollapsed: true,
          },
          fields: [
            { name: 'name', type: 'text', required: true, admin: { width: '50%', description: 'Name for your records, e.g. Bulk prints 10 plus.' } },
            { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { width: '50%', description: 'Untick to switch this rule off.' } },
            {
              name: 'appliesWhen',
              type: 'select',
              defaultValue: 'quantity',
              options: [
                { label: 'Quantity of one item in the cart', value: 'quantity' },
                { label: 'Cart subtotal', value: 'subtotal' },
                { label: 'Items in a category', value: 'category' },
                { label: 'Customers with a role', value: 'role' },
              ],
              admin: { width: '50%', description: 'What has to be true for the discount to apply.' },
            },
            {
              name: 'discountType',
              type: 'select',
              defaultValue: 'percent',
              options: [
                { label: 'Percentage off', value: 'percent' },
                { label: 'Dollars off each item', value: 'fixed' },
              ],
              admin: { width: '50%', description: 'The kind of discount.' },
            },
            { name: 'amount', type: 'number', required: true, min: 0, admin: { width: '50%', description: 'Percent (for example 10) or dollars, depending on the kind of discount.' } },
            { name: 'minQuantity', type: 'number', min: 1, admin: { width: '50%', condition: (data) => data?.appliesWhen === 'quantity', description: 'The buyer must order this many of one item (or more) at once. Blank means 1.' } },
            { name: 'minSubtotal', type: 'number', min: 0, admin: { width: '50%', condition: (data) => data?.appliesWhen === 'subtotal', description: 'Dollars. The cart must reach this total.' } },
            { name: 'category', type: 'text', admin: { width: '50%', condition: (data) => data?.appliesWhen === 'category', description: 'The category slug, e.g. prints.' } },
            { name: 'customerRole', type: 'text', admin: { width: '50%', condition: (data) => data?.appliesWhen === 'role', description: 'The role name, e.g. wholesale. Only signed-in customers with this role get it.' } },
            { name: 'startsAt', type: 'date', admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' }, description: 'Blank means it starts straight away.' } },
            { name: 'endsAt', type: 'date', admin: { width: '50%', date: { pickerAppearance: 'dayAndTime' }, description: 'Blank means it never ends.' } },
            { name: 'priority', type: 'number', defaultValue: 10, admin: { width: '50%', description: 'Lower numbers are checked first. For quantity tiers, give the biggest tier the lowest number.' } },
            { name: 'exclusive', type: 'checkbox', defaultValue: false, admin: { width: '50%', description: 'Stop after this rule: once it applies to an item, later rules do not. Use it for quantity tiers.' } },
            { name: 'showOnProduct', type: 'checkbox', defaultValue: false, admin: { description: 'Show this offer as a note under the quantity box on the product page.' } },
          ],
        },
      ],
    },
    {
      name: 'subscriptionsEnabled',
      type: 'checkbox',
      label: 'Sell subscriptions (Stripe only)',
      defaultValue: false,
      admin: {
        description:
          'Lets products with a subscription plan be bought as a repeating Stripe payment. Needs Stripe card payments switched on in Shop settings > Payments. Subscriptions are not sold through PayPal, and they are bought from the product page rather than the cart. Taxes and shipping are not added to renewals. In your Stripe dashboard, the webhook endpoint must also send these events: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated and customer.subscription.deleted.',
      },
    },
  ],
}
