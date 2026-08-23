import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const Footer: GlobalConfig = {
  slug: 'footer',
  admin: {
    group: 'Settings',
    description: 'Footer columns, contact info, socials, and layout.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'showLogo', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
        {
          name: 'layout',
          type: 'select',
          defaultValue: 'columns-3',
          admin: { width: '50%' },
          options: [
            { label: '3 columns', value: 'columns-3' },
            { label: '4 columns', value: 'columns-4' },
            { label: 'Stacked, centered', value: 'stacked' },
          ],
        },
      ],
    },
    {
      name: 'bottomText',
      type: 'textarea',
      defaultValue:
        'A curated boutique for the modern romantic - considered pieces, small-batch goods, and evenings worth dressing up for.',
      admin: { description: 'Short blurb shown next to the logo.' },
    },
    {
      name: 'columns',
      type: 'array',
      labels: { singular: 'Column', plural: 'Columns' },
      admin: { description: 'Extra link columns, e.g. Shop / Events / Help.', initCollapsed: true },
      fields: [
        { name: 'title', type: 'text', required: true },
        {
          name: 'links',
          type: 'array',
          labels: { singular: 'Link', plural: 'Links' },
          admin: { initCollapsed: true },
          fields: [
            { name: 'label', type: 'text', required: true },
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
              admin: { condition: (_, s) => s?.linkType === 'page' },
            },
            {
              name: 'customUrl',
              type: 'text',
              admin: { condition: (_, s) => s?.linkType !== 'page' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'contact',
      fields: [
        { name: 'email', type: 'text' },
        { name: 'phone', type: 'text' },
        { name: 'address', type: 'text', defaultValue: 'Brisbane, Australia' },
      ],
    },
    {
      type: 'group',
      name: 'socials',
      fields: [
        { name: 'show', type: 'checkbox', defaultValue: true },
        {
          name: 'links',
          type: 'array',
          labels: { singular: 'Social Link', plural: 'Social Links' },
          admin: { condition: (_, s) => Boolean(s?.show), initCollapsed: true },
          fields: [
            {
              name: 'platform',
              type: 'select',
              options: [
                { label: 'Instagram', value: 'Instagram' },
                { label: 'Facebook', value: 'Facebook' },
                { label: 'TikTok', value: 'TikTok' },
                { label: 'Pinterest', value: 'Pinterest' },
                { label: 'X', value: 'X' },
              ],
            },
            { name: 'url', type: 'text' },
          ],
        },
      ],
    },
    {
      name: 'copyrightText',
      type: 'text',
      admin: { description: 'Leave blank to use "© {year} {site name}. All rights reserved."' },
    },
  ],
}
