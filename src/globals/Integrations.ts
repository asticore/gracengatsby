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
      name: 'aiClaudeModel',
      type: 'select',
      label: 'Build with AI: Claude model',
      options: [
        { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5' },
        { label: 'Claude Haiku 4.5 (cheaper)', value: 'claude-haiku-4-5' },
        { label: 'Claude Opus 4.1 (strongest)', value: 'claude-opus-4-1' },
      ],
      defaultValue: 'claude-sonnet-4-5',
      admin: { description: 'The Claude model the visual editor Build with AI feature uses.' },
    },
    {
      name: 'aiOpenaiModel',
      type: 'select',
      label: 'Build with AI: OpenAI model',
      options: [
        { label: 'GPT-4o', value: 'gpt-4o' },
        { label: 'GPT-4o mini (cheaper)', value: 'gpt-4o-mini' },
        { label: 'GPT-4.1', value: 'gpt-4.1' },
      ],
      defaultValue: 'gpt-4o',
      admin: { description: 'The OpenAI model the visual editor Build with AI feature uses.' },
    },
    {
      name: 'aiMonthlyCapUsd',
      type: 'number',
      label: 'Build with AI: monthly spend cap (USD)',
      min: 0,
      defaultValue: 0,
      admin: {
        description:
          'Build with AI stops once this month\'s estimated cost reaches the cap. 0 means no cap. The estimate uses list prices and token counts, so it can differ from your provider bill.',
      },
    },
    {
      type: 'group',
      name: 'google',
      label: 'Google (Analytics, Tag Manager, Maps)',
      admin: { description: 'Measurement IDs and keys for Google services. Tags only load once the visitor agrees, see Cookie consent.' },
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
          label: 'Google Maps key (address suggestions on forms)',
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
              'Use a browser key, restricted to your own website domain (Google Cloud Console > APIs & Services > Credentials > Application restrictions > Websites), with the Places API enabled. Forms with Google Places address lookup send it to visitors, which is why it must be a browser key limited to your domain. Stored encrypted at rest.',
          },
        },
        {
          name: 'pageSpeedApiKey',
          type: 'text',
          label: 'PageSpeed Insights API key',
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
              'Optional. Speed tests work without it but Google allows only a few per minute for everyone sharing the free allowance. A free key (Google Cloud Console > enable "PageSpeed Insights API" > Credentials) gives you your own, much larger quota. Stored encrypted at rest, visible only to admins.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'recaptcha',
      label: 'reCAPTCHA (form spam protection)',
      admin: { description: 'Protects public forms from bots. The secret key is stored encrypted.' },
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
      label: 'Microsoft Clarity (session recordings)',
      admin: { description: 'Heatmaps and session recordings. Loads only after analytics consent.' },
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
      label: 'Meta Pixel (Facebook and Instagram ads)',
      admin: { description: 'Ad conversion tracking. Loads only after marketing consent.' },
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
      label: 'Cloudflare (cache purge)',
      admin: { description: 'Lets the site clear Cloudflare\'s cache when you publish.' },
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
        // Edited on its own page (Settings > Cookie consent, /admin/cookie-consent), so it is
        // hidden from this form. A hidden group still loads and still saves unchanged with the
        // rest of the form (EditForm builds its state from every field). The Cookie consent
        // view clears this flag on its own copy of the fields.
        hidden: true,
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
          name: 'showRejectButton',
          type: 'checkbox',
          label: 'Show the Reject all button',
          defaultValue: true,
          admin: { description: 'Some regulators expect refusing to be as easy as accepting. Switch off only if your advice says so.' },
        },
        { name: 'privacyPolicyLabel', type: 'text', label: 'Privacy policy link text' },
        { name: 'necessaryLabel', type: 'text', label: 'Necessary category name' },
        { name: 'necessaryDescription', type: 'textarea', label: 'Necessary category description' },
        { name: 'preferencesLabel', type: 'text', label: 'Preferences category name' },
        { name: 'preferencesDescription', type: 'textarea', label: 'Preferences category description' },
        { name: 'analyticsLabel', type: 'text', label: 'Analytics category name' },
        { name: 'analyticsDescription', type: 'textarea', label: 'Analytics category description' },
        { name: 'marketingLabel', type: 'text', label: 'Marketing category name' },
        { name: 'marketingDescription', type: 'textarea', label: 'Marketing category description' },
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
        {
          name: 'accentColor',
          type: 'text',
          label: 'Accent colour (switches and focus ring)',
          admin: { components: { Field: '@/admin/components/ColorPickerField#ColorPickerField' } },
        },
        {
          name: 'borderRadius',
          type: 'number',
          label: 'Corner radius (px)',
          min: 0,
          max: 32,
          admin: { description: 'Rounds the banner, dialog and buttons. Leave blank for the default look.' },
        },
        {
          name: 'fontSize',
          type: 'number',
          label: 'Text size (px)',
          min: 12,
          max: 20,
          admin: { description: 'Leave blank for 14.' },
        },
        { name: 'showLogo', type: 'checkbox', label: 'Show a logo in the banner' },
        {
          name: 'logoUrl',
          type: 'text',
          label: 'Logo image URL',
          admin: { description: 'Use a path like /api/media/file/logo.png (a file in the media library). Only used when the logo is switched on.' },
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
      name: 'communications',
      label: 'Email and text messages',
      admin: {
        description:
          'The keys for every email and text message provider. Pick a default email provider, and optionally a fallback that is tried only when the default fails because of a network or provider fault. Keys are encrypted at rest and visible only to admins. Sender details and test sending live under Settings > Communication.',
      },
      fields: [
        {
          name: 'connectionStatus',
          type: 'ui',
          admin: {
            components: {
              Field: '@/features/email/admin/ConnectionStatus#ConnectionStatus',
            },
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'defaultProvider',
              type: 'select',
              label: 'Default email provider',
              admin: {
                width: '50%',
                description: 'The service that sends every email. Set up its key below first.',
              },
              options: [
                { label: 'Resend', value: 'resend' },
                { label: 'Amazon SES (API)', value: 'ses-api' },
                { label: 'Mailgun', value: 'mailgun' },
                { label: 'Postmark', value: 'postmark' },
                { label: 'SendGrid', value: 'sendgrid' },
                { label: 'Cloudflare Email', value: 'cloudflare' },
                { label: 'Brevo', value: 'brevo' },
                { label: 'Mandrill (Mailchimp Transactional)', value: 'mandrill' },
              ],
            },
            {
              name: 'fallbackProvider',
              type: 'select',
              label: 'Fallback email provider',
              defaultValue: 'none',
              admin: {
                width: '50%',
                description: 'Used only when the default provider fails because it is unreachable or busy. Leave as None to skip.',
              },
              options: [
                { label: 'None', value: 'none' },
                { label: 'Resend', value: 'resend' },
                { label: 'Amazon SES (API)', value: 'ses-api' },
                { label: 'Mailgun', value: 'mailgun' },
                { label: 'Postmark', value: 'postmark' },
                { label: 'SendGrid', value: 'sendgrid' },
                { label: 'Cloudflare Email', value: 'cloudflare' },
                { label: 'Brevo', value: 'brevo' },
                { label: 'Mandrill (Mailchimp Transactional)', value: 'mandrill' },
              ],
            },
          ],
        },
        {
          name: 'resend',
          type: 'group',
          label: 'Resend',
          fields: [
            {
              name: 'apiKey',
              type: 'text',
              label: 'Resend API key',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: {
                description: 'Your Resend API key, starting re_. Stored encrypted at rest, visible only to admins.',
              },
            },
          ],
        },
        {
          name: 'sesApi',
          type: 'group',
          label: 'Amazon SES',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'accessKeyId',
                  type: 'text',
                  label: 'Access key ID',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: { width: '33%', description: 'The IAM access key ID. Stored encrypted at rest.' },
                },
                {
                  name: 'secretAccessKey',
                  type: 'text',
                  label: 'Secret access key',
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
                    description: 'The IAM secret key. Use a key that can only send email. Stored encrypted at rest.',
                  },
                },
                {
                  name: 'region',
                  type: 'text',
                  label: 'Region',
                  admin: { width: '33%', description: 'The AWS region your SES account is in, such as ap-southeast-2.' },
                },
              ],
            },
          ],
        },
        {
          name: 'mailgun',
          type: 'group',
          label: 'Mailgun',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'apiKey',
                  type: 'text',
                  label: 'Sending API key',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: { width: '33%', description: 'Your Mailgun sending API key. Stored encrypted at rest.' },
                },
                {
                  name: 'domain',
                  type: 'text',
                  label: 'Sending domain',
                  admin: { width: '33%', description: 'The sending domain you verified with Mailgun.' },
                },
                {
                  name: 'region',
                  type: 'select',
                  label: 'Region',
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
          name: 'postmark',
          type: 'group',
          label: 'Postmark',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'serverToken',
                  type: 'text',
                  label: 'Server token',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: { width: '50%', description: 'The server token from your Postmark server. Stored encrypted at rest.' },
                },
                {
                  name: 'messageStream',
                  type: 'text',
                  label: 'Message stream',
                  defaultValue: 'outbound',
                  admin: { width: '50%', description: 'Which Postmark stream to send on. Leave as outbound unless you set up your own.' },
                },
              ],
            },
          ],
        },
        {
          name: 'sendgrid',
          type: 'group',
          label: 'SendGrid',
          fields: [
            {
              name: 'apiKey',
              type: 'text',
              label: 'SendGrid API key',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: { description: 'Your SendGrid API key, starting SG. Give it send-only permission. Stored encrypted at rest.' },
            },
          ],
        },
        {
          name: 'cloudflare',
          type: 'group',
          label: 'Cloudflare Email',
          fields: [
            {
              type: 'row',
              fields: [
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
                  admin: { width: '50%', description: 'A Cloudflare API token with email sending permission. Stored encrypted at rest.' },
                },
                {
                  name: 'accountId',
                  type: 'text',
                  label: 'Account ID',
                  admin: { width: '50%', description: 'The account ID shown in your Cloudflare dashboard.' },
                },
              ],
            },
          ],
        },
        {
          name: 'brevo',
          type: 'group',
          label: 'Brevo',
          fields: [
            {
              name: 'apiKey',
              type: 'text',
              label: 'Brevo API key',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: { description: 'Found in Brevo under SMTP & API > API keys. Stored encrypted at rest.' },
            },
          ],
        },
        {
          name: 'mandrill',
          type: 'group',
          label: 'Mandrill (Mailchimp Transactional)',
          fields: [
            {
              name: 'apiKey',
              type: 'text',
              label: 'Mandrill API key',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: { description: 'Found in Mailchimp under Transactional > Settings > SMTP & API keys. Stored encrypted at rest.' },
            },
          ],
        },
        {
          name: 'sms',
          type: 'group',
          label: 'Text messages (SMS)',
          admin: {
            description: 'Used to send text message alerts. Twilio is the only provider for now.',
          },
          fields: [
            {
              name: 'provider',
              type: 'select',
              label: 'Text message provider',
              defaultValue: 'twilio',
              options: [{ label: 'Twilio', value: 'twilio' }],
            },
            {
              name: 'twilio',
              type: 'group',
              label: 'Twilio',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'accountSid',
                      type: 'text',
                      label: 'Account SID',
                      admin: { width: '50%', description: 'Starts with AC. Found on the Twilio console home page.' },
                    },
                    {
                      name: 'authToken',
                      type: 'text',
                      label: 'Auth token',
                      access: {
                        read: adminOnlyFieldAccess,
                        update: adminOnlyFieldAccess,
                      },
                      hooks: {
                        beforeChange: [encryptSecretHook],
                        afterRead: [decryptSecretHook],
                      },
                      admin: { width: '50%', description: 'Stored encrypted at rest, visible only to admins.' },
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'fromNumber',
                      type: 'text',
                      label: 'From number',
                      admin: { width: '50%', description: 'Your Twilio number in international format, such as +61400000000.' },
                    },
                    {
                      name: 'messagingServiceSid',
                      type: 'text',
                      label: 'Messaging service SID',
                      admin: {
                        width: '50%',
                        description: 'Optional. If set, texts are sent through this service instead of the From number. Starts with MG.',
                      },
                    },
                  ],
                },
              ],
            },
            {
              name: 'testPhone',
              type: 'text',
              label: 'Test phone number',
              admin: {
                description: 'Where a test text is sent, in international format, such as +61400000000.',
              },
            },
            {
              name: 'sendTestText',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/features/sms/admin/SendTestTextButton#SendTestTextButton',
                },
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'templateRepos',
      label: 'Template repositories',
      admin: {
        description:
          'GitHub repositories that hold ready-made pages and sections for the visual editor. Add a repository and its templates appear in the editor.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Use template repositories',
          defaultValue: false,
          admin: { description: 'Turn this on to show templates from the repositories below in the visual editor.' },
        },
        {
          name: 'reposHelp',
          type: 'ui',
          admin: { components: { Field: '@/admin/fields/TemplateReposHelp#TemplateReposHelp' } },
        },
        {
          name: 'repos',
          type: 'array',
          label: 'Repositories',
          labels: { singular: 'Repository', plural: 'Repositories' },
          fields: [
            {
              name: 'label',
              type: 'text',
              label: 'Name',
              admin: { description: 'A name to recognise this repository by, such as "Agency templates".' },
            },
            {
              name: 'owner',
              type: 'text',
              label: 'GitHub user or organisation',
              admin: { description: 'The part of the address after github.com/, such as "acme" in github.com/acme/templates.' },
            },
            {
              name: 'repo',
              type: 'text',
              label: 'Repository name',
              admin: { description: 'The repository name, such as "templates" in github.com/acme/templates.' },
            },
            {
              name: 'branch',
              type: 'text',
              label: 'Branch',
              defaultValue: 'main',
              admin: { description: 'The branch to read templates from. Usually "main".' },
            },
            {
              name: 'path',
              type: 'text',
              label: 'Folder',
              defaultValue: '',
              admin: { description: 'Leave blank if the templates are at the top of the repository. Otherwise enter the folder they are in.' },
            },
            {
              name: 'enabled',
              type: 'checkbox',
              label: 'Use this repository',
              defaultValue: true,
            },
          ],
        },
        {
          name: 'token',
          type: 'text',
          label: 'Access token (private repositories only)',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: {
            description: 'Fine-grained read-only token. Leave blank for public repos. Stored encrypted at rest, visible only to admins.',
          },
        },
        {
          name: 'reposTools',
          type: 'ui',
          admin: { components: { Field: '@/admin/fields/TemplateReposTools#TemplateReposTools' } },
        },
      ],
    },
    {
      type: 'group',
      name: 'custom',
      label: 'Custom keys',
      admin: { description: 'Your own API keys and credentials, for custom code and integrations.' },
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
    {
      name: 'socialAccounts',
      type: 'array',
      label: 'Social accounts',
      labels: { singular: 'Social account', plural: 'Social accounts' },
      admin: {
        description:
          'Accounts the Social feed element can show posts from. Tokens are stored encrypted, visible only to admins, and never sent to visitors. YouTube and RSS feeds need no token. X (Twitter) is not supported because its API is paid-only.',
      },
      fields: [
        {
          name: 'provider',
          type: 'select',
          label: 'Provider',
          defaultValue: 'instagram',
          options: [
            { label: 'Instagram', value: 'instagram' },
            { label: 'Facebook Page', value: 'facebook' },
            { label: 'Pinterest board', value: 'pinterest' },
            { label: 'TikTok', value: 'tiktok' },
            { label: 'YouTube channel or playlist', value: 'youtube' },
            { label: 'RSS or Atom feed', value: 'rss' },
          ],
        },
        { name: 'label', type: 'text', label: 'Label', admin: { description: 'Shown in the editor account picker.' } },
        {
          name: 'accountId',
          type: 'text',
          label: 'Account ID, handle or feed URL',
          admin: {
            description:
              'Instagram user ID, Facebook Page ID, Pinterest board ID, TikTok (leave empty), YouTube channel ID (UC...) or playlist ID (PL...), or the full https feed URL for RSS.',
          },
        },
        {
          name: 'accessToken',
          type: 'text',
          label: 'Access token',
          access: {
            read: adminOnlyFieldAccess,
            update: adminOnlyFieldAccess,
          },
          hooks: {
            beforeChange: [encryptSecretHook],
            afterRead: [decryptSecretHook],
          },
          admin: { description: 'Long-lived token from the provider. Not needed for YouTube or RSS. Stored encrypted at rest.' },
        },
        { name: 'testConnection', type: 'ui', admin: { components: { Field: '@/features/socialFeeds/admin/TestConnectionField#TestConnectionField' } } },
      ],
    },
  ],
}
