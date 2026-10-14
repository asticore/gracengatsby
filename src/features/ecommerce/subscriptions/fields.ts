import type { Field } from '@/engine'

/**
 * The product edit screen's Subscription card. One JSON column on the product (`subscription`), so the
 * products table gains a single column rather than one per setting (D1 caps a table at 100 columns).
 * Stripe's own ids are not stored here: they are looked up by lookup key when needed (see stripe.ts).
 *
 * `admin.condition` functions are shipped to the browser as source text, so each one stays self-contained.
 */
export const subscriptionFields: Field[] = [
  {
    type: 'collapsible',
    label: 'Subscription',
    admin: {
      condition: (data) => data?.productType === 'simple' || data?.productType === 'variable' || !data?.productType,
      description: 'Sell this product as a repeating payment. Needs Stripe card payments and Subscriptions switched on in Shop settings.',
    },
    fields: [
      {
        name: 'subscription',
        type: 'json',
        admin: {
          components: { Field: '@/features/ecommerce/subscriptions/components/SubscriptionPlanField#SubscriptionPlanField' },
          description: 'How often the customer is billed, any free trial and sign-up fee, and how many payments are taken.',
        },
      },
    ],
  },
]
