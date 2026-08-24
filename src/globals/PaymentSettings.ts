import type { GlobalConfig } from 'payload'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Payment gateway credentials and checkout behaviour.
 *
 * Both gateways have a live and a test identity, and mixing them is the most
 * common cause of "payments silently do nothing": a test publishable key with
 * a live secret key produces errors that look like network trouble. The
 * descriptions name the prefix to look for on each key so a mismatch is
 * visible at a glance.
 *
 * The publishable key is public by design - it appears in the checkout page -
 * and is stored as ordinary text. The secret and webhook keys are not: anyone
 * holding them can move money, so they are encrypted at rest and readable only
 * by admins. Rotate them at the gateway if the database is ever exposed.
 */
export const PaymentSettings: GlobalConfig = {
  slug: 'payment-settings',
  label: 'Payments',
  dbName: 'ac_payment_settings',
  admin: {
    group: 'Settings',
    description:
      'How customers pay you. Use your gateway\'s test keys until you have placed a full practice order, then swap in the live ones.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'stripe',
      label: 'Stripe',
      admin: {
        description: 'Card payments through Stripe. All four values come from the Developers area of your Stripe dashboard.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: false, admin: { width: '50%' } },
            {
              name: 'testMode',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description:
                  'While this is on, no real money moves. Make sure the keys below are the matching test ones - mixing test and live keys causes failures that are hard to diagnose.',
              },
            },
          ],
        },
        {
          name: 'publishableKey',
          type: 'text',
          admin: {
            description:
              'Starts pk_test_ or pk_live_. This one is public - it is used in the checkout page - but it is stored in the database like the rest.',
          },
        },
        {
          name: 'secretKey',
          type: 'text',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: {
            description:
              'Starts sk_test_ or sk_live_. Stored encrypted at rest, visible only to admins. Treat it like your bank password and rotate it in Stripe if it is ever exposed.',
          },
        },
        {
          name: 'webhookSigningSecret',
          type: 'text',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: {
            description:
              'Starts whsec_. Stripe uses it to prove that order updates really came from Stripe. Stored encrypted at rest, visible only to admins.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'paypal',
      label: 'PayPal',
      admin: { description: 'PayPal payments. Credentials come from your PayPal developer dashboard.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: false, admin: { width: '50%' } },
            {
              name: 'environment',
              type: 'select',
              defaultValue: 'sandbox',
              admin: {
                width: '50%',
                description: 'Sandbox is for practice orders. Switch to live only once you have tested, and use the matching credentials.',
              },
              options: [
                { label: 'Sandbox (testing)', value: 'sandbox' },
                { label: 'Live', value: 'live' },
              ],
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'clientId',
              type: 'text',
              admin: { width: '50%', description: 'Your PayPal app client ID. Must match the environment selected above.' },
            },
            {
              name: 'clientSecret',
              type: 'text',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: {
                width: '50%',
                description:
                  'Your PayPal app secret. Stored encrypted at rest, visible only to admins - rotate it in PayPal if it is ever exposed.',
              },
            },
          ],
        },
        {
          name: 'allowPayPalLater',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Offer PayPal\'s pay-in-instalments option at checkout. Availability depends on your account and the customer\'s country.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'general',
      label: 'General',
      admin: { description: 'Settings that apply no matter which gateway takes the payment.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'currency',
              type: 'select',
              defaultValue: 'AUD',
              admin: { width: '33%', description: 'The currency prices are charged in.' },
              options: [
                { label: 'Australian dollar (AUD)', value: 'AUD' },
                { label: 'US dollar (USD)', value: 'USD' },
                { label: 'British pound (GBP)', value: 'GBP' },
                { label: 'Euro (EUR)', value: 'EUR' },
                { label: 'New Zealand dollar (NZD)', value: 'NZD' },
              ],
            },
            {
              name: 'captureMethod',
              type: 'select',
              defaultValue: 'automatic',
              admin: {
                width: '33%',
                description:
                  'Automatic takes the money at checkout. Manual only reserves it, and you confirm the charge later - useful for made-to-order items, but reservations expire after a few days.',
              },
              options: [
                { label: 'Automatic - charge at checkout', value: 'automatic' },
                { label: 'Manual - reserve now, charge later', value: 'manual' },
              ],
            },
            {
              name: 'statementDescriptor',
              type: 'text',
              admin: {
                width: '33%',
                description:
                  'What customers see on their bank statement. Make it recognisably your shop - an unfamiliar name is a common cause of chargebacks. Usually limited to 22 characters.',
              },
            },
          ],
        },
      ],
    },
  ],
}
