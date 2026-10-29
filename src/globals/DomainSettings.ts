import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'
import { LOCALE_OPTIONS } from '../features/multilingual/locales'
import { domainSettingsBeforeChange } from '../features/domains/hooks'
import { invalidateDomainsCache } from '../features/domains/store'

/**
 * Regional domains (example.com, example.com.au, example.co.uk) served by this one site.
 *
 * The rows are read at the edge by src/features/domains/store.ts (table eg_domain_settings_domains), so the
 * hook below is the only place a row is checked: it refuses a host that is not a bare domain, a duplicate,
 * or a set without exactly one primary domain. Mirror: src/features/domains/model.ts.
 *
 * Every domain also has to be attached to the Cloudflare Worker (Workers > Settings > Domains & Routes >
 * Custom domain), with its DNS in the same Cloudflare account. This screen cannot create DNS or routes.
 */
export const DomainSettings: GlobalConfig = {
  slug: 'domain-settings',
  label: 'Domains',
  dbName: 'eg_domain_settings',
  hooks: {
    beforeChange: [domainSettingsBeforeChange],
    // This isolate reads the new registry at once; other isolates pick it up within the cache window (60 seconds).
    afterChange: [() => invalidateDomainsCache()],
  },
  admin: {
    group: 'Settings',
    description:
      'Serve this site on more than one domain, for example example.com for the main site and example.com.au for Australia. Each domain must ALSO be attached to the Cloudflare Worker before it works: in Cloudflare open Workers & Pages, choose this site, then Settings > Domains & Routes > Add > Custom domain, and create the DNS record in the same Cloudflare account. This screen cannot create DNS or routes for you. Exactly one domain is the primary; other domains can redirect to it. Unknown hosts keep working as before.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'domains',
      type: 'array',
      labels: { singular: 'Domain', plural: 'Domains' },
      admin: {
        description:
          'Add one row per domain name, without https:// or a path. Set one row as the primary domain. A disabled domain is ignored by visitors, and its admin is unreachable through it.',
        initCollapsed: false,
      },
      fields: [
        {
          name: 'host',
          type: 'text',
          label: 'Domain',
          admin: { width: '50%', description: 'Host name only, e.g. example.com.au' },
        },
        {
          name: 'label',
          type: 'text',
          label: 'Name',
          admin: { width: '50%', description: 'For your records, e.g. Australia' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'defaultLocale',
              type: 'select',
              label: 'Default language',
              options: LOCALE_OPTIONS,
              admin: {
                width: '50%',
                description:
                  'The language visitors get on this domain without a language prefix. Must be one of the enabled website languages (Settings > General > Languages). Leave blank to use the site primary language.',
              },
            },
            {
              name: 'currencyHint',
              type: 'text',
              label: 'Currency hint',
              admin: {
                width: '50%',
                description: 'Three-letter code such as AUD. Stored only: shoppers still pay in the shop currency for now.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'isPrimary',
              type: 'checkbox',
              label: 'Primary domain',
              defaultValue: false,
              admin: { width: '50%', description: 'Exactly one domain must be primary, and it must be active.' },
            },
            {
              name: 'status',
              type: 'select',
              label: 'Status',
              defaultValue: 'active',
              options: [
                { label: 'Active', value: 'active' },
                { label: 'Disabled', value: 'disabled' },
              ],
              admin: { width: '50%', description: 'Disabled domains are not served by this site.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'redirectToPrimary',
              type: 'checkbox',
              label: 'Redirect to primary',
              defaultValue: false,
              admin: {
                width: '50%',
                description: 'Send visitors to the same page on the primary domain (permanent redirect). Not applied to the primary itself.',
              },
            },
            {
              name: 'allowAdmin',
              type: 'checkbox',
              label: 'Allow admin',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Let the admin area open on this domain. Off sends admin visits to the primary domain. The primary always allows admin.',
              },
            },
          ],
        },
      ],
    },
  ],
}
