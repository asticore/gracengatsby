import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Which service sends the site's transactional email - receipts, password
 * resets, form notifications.
 *
 * IMPORTANT: this site runs on Cloudflare Workers, which cannot open the raw
 * network connections SMTP needs. Classic SMTP (and anything built on
 * nodemailer) therefore cannot work here no matter how correct the host, port
 * and password are. Every other option below talks to its provider over an
 * ordinary web request instead, which Workers can do.
 *
 * SMTP is therefore no longer offered as a provider - leaving it selectable
 * meant a site could be configured into a state where nothing was ever sent and
 * nothing said so. The SMTP fields themselves are kept, but only appear once a
 * database already holds SMTP details, so an operator migrating from another
 * host can still read their old settings off this screen while they move
 * across. Nothing new is ever written there and nothing is ever sent from it.
 *
 * API keys are encrypted at rest in the database and readable only by admins,
 * so they can still be rotated from this screen. Treat these keys as you would
 * any other password and rotate them at the provider if the database is ever
 * exposed.
 */
export const EmailSettings: GlobalConfig = {
  slug: 'email-settings',
  label: 'Email',
  dbName: 'eg_email_settings',
  admin: {
    group: 'Settings',
    description:
      'The service used to send email from your site. You will need an account with one of these providers and a sending domain they have verified.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'provider',
      type: 'select',
      defaultValue: 'resend',
      admin: {
        description:
          'This site runs on Cloudflare Workers, which cannot make the kind of direct connection traditional SMTP requires. If you have SMTP details from your old host they will not work here - pick one of the other providers instead and use the API key it gives you.',
      },
      options: [
        { label: 'Resend', value: 'resend' },
        { label: 'Amazon SES (API)', value: 'ses-api' },
        { label: 'Mailgun', value: 'mailgun' },
        { label: 'Postmark', value: 'postmark' },
        { label: 'SendGrid', value: 'sendgrid' },
        { label: 'Cloudflare Email', value: 'cloudflare' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'fromName',
          type: 'text',
          admin: { width: '33%', description: 'The name recipients see in their inbox.' },
        },
        {
          name: 'fromEmail',
          type: 'text',
          admin: {
            width: '33%',
            description: 'The address email is sent from. It must be on a domain your provider has verified.',
          },
        },
        {
          name: 'replyToEmail',
          type: 'text',
          admin: { width: '33%', description: 'Where replies go, if that differs from the sending address.' },
        },
      ],
    },
    {
      type: 'group',
      name: 'resend',
      label: 'Resend',
      admin: { condition: (_, s) => s?.provider === 'resend' },
      fields: [
        {
          name: 'apiKey',
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
              'Your Resend API key, starting re_. Stored encrypted at rest, visible only to admins - rotate it at Resend if you ever suspect it has leaked.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'sesApi',
      label: 'Amazon SES',
      admin: { condition: (_, s) => s?.provider === 'ses-api' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'accessKeyId',
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
                width: '33%',
                description: 'The IAM access key ID. Stored encrypted at rest, visible only to admins.',
              },
            },
            {
              name: 'secretAccessKey',
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
                width: '33%',
                description:
                  'The IAM secret access key. Stored encrypted at rest, visible only to admins - use a key that can only send email, nothing else.',
              },
            },
            {
              name: 'region',
              type: 'text',
              admin: { width: '33%', description: 'The AWS region your SES account is set up in, such as ap-southeast-2.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'mailgun',
      label: 'Mailgun',
      admin: { condition: (_, s) => s?.provider === 'mailgun' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'apiKey',
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
                width: '33%',
                description: 'Your Mailgun sending API key. Stored encrypted at rest, visible only to admins.',
              },
            },
            {
              name: 'domain',
              type: 'text',
              admin: { width: '33%', description: 'The sending domain you verified with Mailgun.' },
            },
            {
              name: 'region',
              type: 'select',
              defaultValue: 'us',
              admin: { width: '33%', description: 'Which Mailgun region hosts your account. Getting this wrong causes silent failures.' },
              options: [
                { label: 'US', value: 'us' },
                { label: 'EU', value: 'eu' },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'postmark',
      label: 'Postmark',
      admin: { condition: (_, s) => s?.provider === 'postmark' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'serverToken',
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
                description: 'The server token from your Postmark server. Stored encrypted at rest, visible only to admins.',
              },
            },
            {
              name: 'messageStream',
              type: 'text',
              defaultValue: 'outbound',
              admin: { width: '50%', description: 'Which Postmark stream to send on. Leave as outbound unless you set up your own.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'sendgrid',
      label: 'SendGrid',
      admin: { condition: (_, s) => s?.provider === 'sendgrid' },
      fields: [
        {
          name: 'apiKey',
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
              'Your SendGrid API key, starting SG. Stored encrypted at rest, visible only to admins - give it send-only permission.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'cloudflare',
      label: 'Cloudflare Email',
      admin: { condition: (_, s) => s?.provider === 'cloudflare' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'apiToken',
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
                description: 'A Cloudflare API token with email sending permission. Stored encrypted at rest, visible only to admins.',
              },
            },
            {
              name: 'accountId',
              type: 'text',
              admin: { width: '50%', description: 'The account ID shown in your Cloudflare dashboard.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'smtp',
      label: 'SMTP (old settings, cannot send)',
      admin: {
        // Shown only where SMTP details already exist. A fresh install never
        // sees this group at all; a site migrating in keeps its old details
        // readable until it clears them.
        condition: (_, s) => Boolean(s?.smtp?.host || s?.smtp?.username),
        description:
          'These are your old SMTP details, kept for reference only. Nothing is ever sent through them. This site runs on Cloudflare Workers, which cannot make the kind of direct connection SMTP needs, so pick one of the providers above and use the API key it gives you. Once you have moved across you can clear these fields.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'host', type: 'text', admin: { width: '50%' } },
            { name: 'port', type: 'number', defaultValue: 587, admin: { width: '50%' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'username', type: 'text', admin: { width: '50%' } },
            {
              name: 'password',
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
                description: 'Stored encrypted at rest, visible only to admins.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'testing',
      label: 'Testing',
      admin: {
        description:
          'A test message, sent to yourself, is the quickest way to confirm your provider details are right. Test sending is triggered from this screen rather than from the provider.',
      },
      fields: [
        {
          name: 'testRecipient',
          type: 'text',
          admin: {
            description:
              'Where the test message is sent. Use an inbox you can actually open, and check the spam folder if nothing arrives.',
          },
        },
        {
          // A ui field: it renders the send button and stores nothing, so no
          // schema change comes with it.
          name: 'sendTest',
          type: 'ui',
          admin: {
            components: {
              Field: '@/features/email/admin/SendTestEmailButton#SendTestEmailButton',
            },
          },
        },
      ],
    },
  ],
}
