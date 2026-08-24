import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Site-wide SEO and analytics defaults.
 *
 * These are FALLBACKS. A page, post or product that fills in its own SEO
 * fields always wins - nothing here overwrites a value someone typed on the
 * document itself.
 *
 * The verification and analytics IDs are public by design: they end up in the
 * page source of every visitor's browser anyway, so they are not treated as
 * secrets and are readable through the public API like the rest of this global.
 *
 * `customCode` is the one genuinely dangerous group here - see the warning on
 * it. It is kept in its own group so it is hard to paste into by accident.
 */
export const SeoSettings: GlobalConfig = {
  slug: 'seo-settings',
  label: 'SEO & Analytics',
  dbName: 'ac_seo_settings',
  admin: {
    group: 'Settings',
    description:
      'Search engine and analytics defaults for the whole site. Individual pages can override the title and description on their own SEO tab.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'defaults',
      label: 'Defaults',
      admin: {
        description:
          'Used whenever a page has not set its own title, description or share image.',
      },
      fields: [
        {
          name: 'titleTemplate',
          type: 'text',
          defaultValue: '%page% | %site%',
          admin: {
            description:
              'How browser tab titles are built. %page% is replaced with the page name and %site% with your site name.',
          },
        },
        {
          name: 'metaDescription',
          type: 'textarea',
          admin: {
            description:
              'The summary search engines show under your link. Aim for roughly 150 characters - longer gets cut off.',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'defaultOgImage',
              type: 'upload',
              relationTo: 'media',
              admin: {
                width: '50%',
                description: 'The picture used when someone shares a link. 1200x630 pixels works best.',
              },
            },
            {
              name: 'twitterHandle',
              type: 'text',
              admin: { width: '50%', description: 'Your X / Twitter username, including the @.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'indexing',
      label: 'Indexing',
      admin: {
        description:
          'Controls whether search engines are allowed to list your pages in their results.',
      },
      fields: [
        {
          name: 'allowIndexing',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Turn this off to ask search engines to keep the entire site out of their results - handy before launch. Remember to turn it back on.',
          },
        },
        {
          name: 'noindexPaths',
          type: 'textarea',
          admin: {
            description:
              'Pages you want hidden from search results while the rest of the site stays visible. One address per line, for example /thank-you.',
          },
        },
        {
          name: 'customRobotsTxt',
          type: 'textarea',
          admin: {
            description:
              'Leave blank and a sensible robots.txt is generated for you. Anything typed here replaces it completely.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'verification',
      label: 'Verification',
      admin: {
        description:
          'Codes each search engine gives you to prove you own this site. Paste in just the code, not the whole tag they show you.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'google', type: 'text', admin: { width: '33%', description: 'From Google Search Console.' } },
            { name: 'bing', type: 'text', admin: { width: '33%', description: 'From Bing Webmaster Tools.' } },
            { name: 'pinterest', type: 'text', admin: { width: '33%', description: 'From Pinterest business settings.' } },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'analytics',
      label: 'Analytics',
      admin: {
        description:
          'Visitor tracking. Paste the ID from each service you use and leave the rest blank.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'ga4MeasurementId',
              type: 'text',
              admin: { width: '33%', description: 'Google Analytics 4, looks like G-XXXXXXXXXX.' },
            },
            {
              name: 'gtmContainerId',
              type: 'text',
              admin: { width: '33%', description: 'Google Tag Manager, looks like GTM-XXXXXXX.' },
            },
            {
              name: 'metaPixelId',
              type: 'text',
              admin: { width: '33%', description: 'Meta (Facebook) pixel - a long number.' },
            },
          ],
        },
        {
          name: 'requireCookieConsent',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'Hold back tracking scripts until a visitor accepts cookies. Leaving this on is the safer choice in the UK, EU and Australia.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'schema',
      label: 'Schema',
      admin: {
        description:
          'Extra background detail search engines use to build your business panel in results.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'organisationName',
              type: 'text',
              admin: { width: '50%', description: 'The legal or trading name people search for.' },
            },
            {
              name: 'type',
              type: 'select',
              defaultValue: 'business',
              admin: { width: '50%', description: 'What this site represents.' },
              options: [
                { label: 'Local business', value: 'business' },
                { label: 'Organisation', value: 'organisation' },
                { label: 'Person', value: 'person' },
              ],
            },
          ],
        },
        {
          name: 'logo',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'A square logo on a plain background reads best in search results.' },
        },
        {
          name: 'sameAs',
          type: 'array',
          labels: { singular: 'Profile', plural: 'Profiles' },
          admin: {
            description:
              'Links to your profiles elsewhere - Instagram, Facebook, LinkedIn. This is how search engines connect them to you.',
          },
          fields: [{ name: 'url', type: 'text' }],
        },
      ],
    },
    {
      type: 'group',
      name: 'sitemap',
      label: 'Sitemap',
      admin: {
        description: 'The index of your pages that search engines read to find everything.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
            {
              name: 'changeFrequency',
              type: 'select',
              defaultValue: 'weekly',
              admin: { width: '50%', description: 'A hint about how often your pages change. A rough guess is fine.' },
              options: [
                { label: 'Always', value: 'always' },
                { label: 'Hourly', value: 'hourly' },
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
                { label: 'Monthly', value: 'monthly' },
                { label: 'Yearly', value: 'yearly' },
                { label: 'Never', value: 'never' },
              ],
            },
          ],
        },
        {
          name: 'excludePaths',
          type: 'textarea',
          admin: { description: 'Addresses to leave out of the sitemap. One per line.' },
        },
      ],
    },
    {
      type: 'group',
      name: 'customCode',
      label: 'Custom code',
      admin: {
        description:
          'Warning: anything pasted here runs on every single page of your site, for every visitor. A broken snippet can take the whole site down, and a snippet from an untrusted source can read anything your visitors type. Only paste code you got from a service you trust.',
      },
      fields: [
        {
          name: 'headScripts',
          type: 'textarea',
          admin: {
            description: 'Added near the top of the page. Most verification and tracking snippets belong here.',
          },
        },
        {
          name: 'bodyEndScripts',
          type: 'textarea',
          admin: {
            description: 'Added at the very bottom. Use this for anything that should load after the page is drawn.',
          },
        },
      ],
    },
  ],
}
