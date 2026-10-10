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
      name: 'consent',
      label: 'Cookie consent',
      admin: {
        description:
          'The cookie banner and the gate in front of analytics, marketing tags and custom scripts. Changing the policy version asks every visitor again.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Show the cookie banner and gate tracking',
          defaultValue: true,
        },
        {
          name: 'mode',
          type: 'select',
          label: 'Consent mode',
          options: [
            { label: 'Opt-in everywhere', value: 'opt-in-all' },
            { label: 'Opt-in in EU/UK/EEA/CH only, opt-out elsewhere', value: 'opt-in-regional' },
            { label: 'Notice only (tags load straight away)', value: 'notice-only' },
          ],
          admin: {
            description:
              'Leave blank to follow the older "Hold back tracking scripts" setting in SEO & Analytics: on means opt-in everywhere, off means notice only.',
          },
        },
        {
          name: 'policyVersion',
          type: 'number',
          label: 'Policy version',
          defaultValue: 1,
          min: 1,
          admin: { description: 'Raise this number after you change the cookie policy. Visitors are asked again.' },
        },
        { name: 'bannerTitle', type: 'text', label: 'Banner title' },
        { name: 'bannerText', type: 'textarea', label: 'Banner text' },
        { name: 'acceptLabel', type: 'text', label: 'Accept all button label' },
        { name: 'rejectLabel', type: 'text', label: 'Reject all button label' },
        { name: 'customiseLabel', type: 'text', label: 'Customise button label' },
        { name: 'saveLabel', type: 'text', label: 'Save choices button label' },
        {
          name: 'position',
          type: 'select',
          label: 'Banner position',
          defaultValue: 'bottom',
          options: [
            { label: 'Bottom bar', value: 'bottom' },
            { label: 'Bottom left', value: 'bottom-left' },
            { label: 'Bottom right', value: 'bottom-right' },
            { label: 'Centre', value: 'center' },
          ],
        },
        {
          name: 'theme',
          type: 'select',
          label: 'Banner theme',
          defaultValue: 'auto',
          options: [
            { label: 'Follow the site theme', value: 'auto' },
            { label: 'Light', value: 'light' },
            { label: 'Dark', value: 'dark' },
          ],
        },
        {
          name: 'bannerBackground',
          type: 'text',
          label: 'Banner background colour',
          admin: { components: { Field: '@/admin/components/ColorPickerField#ColorPickerField' } },
        },
        {
          name: 'bannerTextColor',
          type: 'text',
          label: 'Banner text colour',
          admin: { components: { Field: '@/admin/components/ColorPickerField#ColorPickerField' } },
        },
        {
          name: 'buttonColor',
          type: 'text',
          label: 'Button colour',
          admin: { components: { Field: '@/admin/components/ColorPickerField#ColorPickerField' } },
        },
        { name: 'privacyPolicyUrl', type: 'text', label: 'Privacy policy URL' },
        { name: 'cookieSettingsLabel', type: 'text', label: 'Cookie settings link label' },
        {
          name: 'cookieList',
          type: 'array',
          label: 'Cookies in use',
          labels: { singular: 'Cookie', plural: 'Cookies' },
          admin: { description: 'Listed under each category in the Customise view.' },
          fields: [
            {
              name: 'category',
              type: 'select',
              label: 'Category',
              defaultValue: 'analytics',
              options: [
                { label: 'Necessary', value: 'necessary' },
                { label: 'Preferences', value: 'preferences' },
                { label: 'Analytics', value: 'analytics' },
                { label: 'Marketing', value: 'marketing' },
              ],
            },
            { name: 'name', type: 'text', label: 'Cookie name' },
            { name: 'provider', type: 'text', label: 'Provider' },
            { name: 'purpose', type: 'textarea', label: 'Purpose' },
            { name: 'duration', type: 'text', label: 'Duration' },
          ],
        },
        {
          name: 'geoLogging',
          type: 'checkbox',
          label: 'Record the visitor country with each consent log entry',
          admin: { description: 'Country only, from Cloudflare. Never an IP address or user agent.' },
        },
        {
          name: 'logConsent',
          type: 'checkbox',
          label: 'Keep an anonymised log of consent choices',
          defaultValue: true,
          admin: { description: 'Written to the audit log as consent.update. Viewable under Audit log.' },
        },
        {
          name: 'consentModeV2',
          type: 'checkbox',
          label: 'Send Google Consent Mode v2 signals',
          defaultValue: true,
        },
        {
          name: 'headScriptCategory',
          type: 'select',
          label: 'Custom head scripts: category',
          defaultValue: 'analytics',
          options: [
            { label: 'Necessary (runs at once)', value: 'necessary' },
            { label: 'Preferences', value: 'preferences' },
            { label: 'Analytics', value: 'analytics' },
            { label: 'Marketing', value: 'marketing' },
          ],
          admin: { description: 'Custom head code waits for this category unless it is Necessary.' },
        },
        {
          name: 'bodyScriptCategory',
          type: 'select',
          label: 'Custom body-end scripts: category',
          defaultValue: 'analytics',
          options: [
            { label: 'Necessary (runs at once)', value: 'necessary' },
            { label: 'Preferences', value: 'preferences' },
            { label: 'Analytics', value: 'analytics' },
            { label: 'Marketing', value: 'marketing' },
          ],
          admin: { description: 'Custom body-end code waits for this category unless it is Necessary.' },
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
