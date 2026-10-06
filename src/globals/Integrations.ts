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
      label: 'Claude API key',
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
          'Found at console.anthropic.com. Stored encrypted at rest, visible only to admins.',
      },
    },
    {
      name: 'openaiApiKey',
      type: 'text',
      label: 'OpenAI API key',
      access: {
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      hooks: {
        beforeChange: [encryptSecretHook],
        afterRead: [decryptSecretHook],
      },
      admin: {
        description: 'Found at platform.openai.com. Stored encrypted at rest, visible only to admins.',
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
          label: 'Google Analytics 4 measurement ID (G-...)',
          admin: { description: 'Found in Google Analytics > Admin > Data streams.' },
        },
        {
          name: 'gtmContainerId',
          type: 'text',
          label: 'Google Tag Manager container ID (GTM-...)',
          admin: { description: 'Found in Google Tag Manager > Admin > Container settings.' },
        },
        {
          name: 'searchConsoleVerification',
          type: 'text',
          label: 'Search Console verification code',
          admin: { description: 'Found in Google Search Console > Settings > Ownership verification.' },
        },
        {
          name: 'mapsApiKey',
          type: 'text',
          label: 'Google Maps API key',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: {
            description: 'Found in Google Cloud Console > APIs & Services > Credentials. Stored encrypted at rest, visible only to admins.',
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
          label: 'reCAPTCHA version',
          defaultValue: 'v3',
          options: [
            { label: 'v2 Checkbox', value: 'v2' },
            { label: 'v3', value: 'v3' },
          ],
          admin: { description: 'Which version to use. Found at google.com/recaptcha/admin.' },
        },
        {
          name: 'siteKey',
          type: 'text',
          label: 'reCAPTCHA site key',
          admin: { description: 'Found at google.com/recaptcha/admin. Public, safe to embed.' },
        },
        {
          name: 'secretKey',
          type: 'text',
          label: 'reCAPTCHA secret key',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: {
            description: 'Found at google.com/recaptcha/admin. Stored encrypted at rest, visible only to admins.',
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
          label: 'Clarity project ID',
          admin: { description: 'Found in Microsoft Clarity > Settings > Project ID.' },
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
          label: 'Meta pixel ID',
          admin: { description: 'Found in Meta Business Suite > Events Manager > Pixels.' },
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
          label: 'Zone ID',
          admin: { description: 'Found in Cloudflare > Account > Websites > Zone ID.' },
        },
        {
          name: 'apiToken',
          type: 'text',
          label: 'API token',
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
              'Found in Cloudflare > My Profile > API Tokens. Needs Zone > Cache Purge permission. Stored encrypted at rest, visible only to admins.',
          },
        },
        {
          name: 'purgeOnPublish',
          type: 'checkbox',
          label: 'Purge cache on publish',
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
          label: 'Keys',
          labels: { singular: 'Key', plural: 'Keys' },
          fields: [
            {
              name: 'name',
              type: 'text',
              label: 'Name',
              admin: { description: 'A name to remember this key by.' },
            },
            {
              name: 'value',
              type: 'text',
              label: 'Value',
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
            {
              name: 'note',
              type: 'text',
              label: 'Note',
              admin: { description: 'Optional note about this key or where to find it.' },
            },
          ],
        },
      ],
    },
  ],
}
