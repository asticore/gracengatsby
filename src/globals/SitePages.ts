import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { maintenanceTokenBeforeChange } from '@/features/site/maintenance'

/**
 * Special pages (the 404 page, the privacy policy and terms) and the maintenance screen.
 *
 * The bypass token lets a visitor past the maintenance screen, so it is admin-only to read. Public
 * readers see the rest of the group and never the token. Table eg_site_pages.
 */
export const SitePages: GlobalConfig = {
  slug: 'site-pages',
  label: 'Site pages and maintenance',
  dbName: 'eg_site_pages',
  hooks: {
    beforeChange: [maintenanceTokenBeforeChange],
  },
  admin: {
    group: 'Settings',
    description: 'Pick the pages used for 404 errors, the privacy policy and terms, and switch on the maintenance screen.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'notFoundPage',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Page not found (404) page',
      admin: {
        description: 'Shown when a visitor opens an address that does not exist. Leave blank for the built-in message.',
      },
    },
    {
      name: 'privacyPolicyPage',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Privacy policy page',
      admin: {
        description: 'Linked from the cookie banner when the Integrations privacy policy URL is blank.',
      },
    },
    {
      name: 'termsPage',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Terms page',
      admin: {
        description: 'The page for your terms and conditions.',
      },
    },
    {
      type: 'group',
      name: 'maintenance',
      label: 'Maintenance mode',
      admin: {
        description: 'While this is on, visitors see the maintenance screen instead of the site. Admins can still see the site when allowed below.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Turn on maintenance mode',
          defaultValue: false,
          admin: {
            description: 'Off by default. Search engines are told not to index the maintenance screen.',
          },
        },
        {
          name: 'headline',
          type: 'text',
          label: 'Headline',
          defaultValue: "We'll be back soon",
        },
        {
          name: 'message',
          type: 'textarea',
          label: 'Message',
          admin: {
            description: 'A short note for visitors, such as when the site will be back.',
          },
        },
        {
          name: 'bypassToken',
          type: 'text',
          label: 'Preview link',
          access: {
            read: adminOnlyFieldAccess,
            update: () => false,
          },
          admin: {
            readOnly: true,
            description:
              'Created when maintenance mode is first turned on. Share the link below to let someone see the real site while it is on. Opening it lasts 7 days.',
            components: { Field: '@/admin/components/MaintenanceBypassField#MaintenanceBypassField' },
          },
        },
        {
          name: 'allowAdmins',
          type: 'checkbox',
          label: 'Let signed-in admins see the site',
          defaultValue: true,
          admin: {
            description: 'Signed-in admins skip the maintenance screen when this is on.',
          },
        },
      ],
    },
  ],
}
