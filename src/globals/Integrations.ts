import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

export const Integrations: GlobalConfig = {
  slug: 'integrations',
  dbName: 'eg_integrations',
  label: 'Integrations',
  admin: {
    group: 'Settings',
    description:
      'API keys and third-party credentials. Admin-only, encrypted at rest, and never exposed to the public site or its API.',
  },
  access: {
    // Locked down at the global level too, so an unauthenticated REST/GraphQL
    // call to /api/globals/integrations gets nothing back - not just this field.
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      name: 'claudeApiKey',
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
          'Your Claude API key (console.anthropic.com). Stored encrypted at rest, visible only to admins. Not wired to any feature yet - saved here so it is ready when you build one.',
      },
    },
    {
      name: 'openaiApiKey',
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
        description: 'Your OpenAI API key. Stored encrypted at rest, visible only to admins.',
      },
    },
    {
      type: 'group',
      name: 'google',
      label: 'Google',
      fields: [
        {
          name: 'ga4MeasurementId',
          type: 'text',
          admin: { description: 'Google Analytics 4 measurement ID (G-XXXXXXXXXX).' },
        },
        {
          name: 'gtmContainerId',
          type: 'text',
          admin: { description: 'Google Tag Manager container ID (GTM-XXXXXXX).' },
        },
        {
          name: 'searchConsoleVerification',
          type: 'text',
          admin: { description: 'Google Search Console verification code.' },
        },
        {
          name: 'mapsApiKey',
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
            description: 'Google Maps API key. Stored encrypted at rest, visible only to admins.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'recaptcha',
      label: 'reCAPTCHA',
      fields: [
        {
          name: 'version',
          type: 'select',
          defaultValue: 'v3',
          options: [
            { label: 'v2 Checkbox', value: 'v2' },
            { label: 'v3', value: 'v3' },
          ],
          admin: { description: 'Which reCAPTCHA version to use.' },
        },
        {
          name: 'siteKey',
          type: 'text',
          admin: { description: 'reCAPTCHA site key. Public, safe to embed.' },
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
            description: 'reCAPTCHA secret key. Stored encrypted at rest, visible only to admins.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'clarity',
      label: 'Microsoft Clarity',
      fields: [
        {
          name: 'projectId',
          type: 'text',
          admin: { description: 'Microsoft Clarity project ID.' },
        },
      ],
    },
    {
      type: 'group',
      name: 'metaPixel',
      label: 'Meta Pixel',
      fields: [
        {
          name: 'pixelId',
          type: 'text',
          admin: { description: 'Meta Pixel ID.' },
        },
      ],
    },
    {
      type: 'group',
      name: 'cloudflare',
      label: 'Cloudflare',
      fields: [
        {
          name: 'zoneId',
          type: 'text',
          admin: { description: 'Cloudflare Zone ID.' },
        },
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
            description:
              'Cloudflare API token with Zone > Cache Purge permission. Stored encrypted at rest, visible only to admins.',
          },
        },
        {
          name: 'purgeOnPublish',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description: 'Automatically purge Cloudflare cache when you publish content.',
            components: {
              Field: '@/admin/components/CloudflarePurgeOnPublishField#CloudflarePurgeOnPublishField',
            },
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'custom',
      label: 'Custom Keys',
      admin: { description: 'Add your own API keys and credentials.' },
      fields: [
        {
          name: 'keys',
          type: 'array',
          labels: { singular: 'Key', plural: 'Keys' },
          fields: [
            {
              name: 'name',
              type: 'text',
              admin: { description: 'A name to remember this key by.' },
            },
            {
              name: 'value',
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
                description: 'The API key or credential value. Stored encrypted at rest, visible only to admins.',
              },
            },
          ],
        },
      ],
    },
  ],
}