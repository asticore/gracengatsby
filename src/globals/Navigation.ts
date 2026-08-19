import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  admin: {
    group: 'Site Settings',
    description: 'The links shown in the header menu, in order.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'items',
      type: 'array',
      labels: { singular: 'Menu Item', plural: 'Menu Items' },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
        },
        {
          name: 'linkType',
          type: 'select',
          defaultValue: 'custom',
          options: [
            { label: 'A page you built', value: 'page' },
            { label: 'Custom URL', value: 'custom' },
          ],
        },
        {
          name: 'page',
          type: 'relationship',
          relationTo: 'pages',
          admin: {
            condition: (_, siblingData) => siblingData?.linkType === 'page',
          },
        },
        {
          name: 'customUrl',
          type: 'text',
          admin: {
            description: 'e.g. /shop, /#about, or a full https:// link.',
            condition: (_, siblingData) => siblingData?.linkType !== 'page',
          },
        },
        {
          name: 'openInNewTab',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
  ],
}
