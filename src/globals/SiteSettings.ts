import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  admin: {
    group: 'Site Settings',
    description: 'Site identity, theming, and footer content - changes apply everywhere immediately.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'Grace & Gatsby',
    },
    {
      name: 'tagline',
      type: 'text',
      defaultValue: 'A curated boutique for the modern romantic.',
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Shown in the header. Leave blank to show the site name as text instead.' },
    },
    {
      name: 'favicon',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'announcementBar',
      type: 'text',
      admin: {
        description: 'Optional short banner shown at the very top of every page. Leave blank to hide it.',
      },
    },
    {
      type: 'group',
      name: 'theme',
      fields: [
        {
          name: 'primaryColor',
          type: 'text',
          defaultValue: '#14110f',
          admin: { description: 'Hex color, e.g. #14110f. Main text/ink color.' },
        },
        {
          name: 'accentColor',
          type: 'text',
          defaultValue: '#b9924b',
          admin: { description: 'Hex color, e.g. #b9924b. Buttons, links, highlights.' },
        },
        {
          name: 'backgroundColor',
          type: 'text',
          defaultValue: '#f6f1e7',
          admin: { description: 'Hex color, e.g. #f6f1e7. Page background.' },
        },
        {
          name: 'headingFont',
          type: 'select',
          defaultValue: 'cormorant',
          options: [
            { label: 'Cormorant Garamond (elegant serif)', value: 'cormorant' },
            { label: 'Playfair Display (bold serif)', value: 'playfair' },
            { label: 'Cinzel (Art Deco display)', value: 'cinzel' },
          ],
        },
        {
          name: 'bodyFont',
          type: 'select',
          defaultValue: 'jost',
          options: [
            { label: 'Jost (geometric sans)', value: 'jost' },
            { label: 'Montserrat', value: 'montserrat' },
            { label: 'Inter', value: 'inter' },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'footer',
      fields: [
        {
          name: 'text',
          type: 'textarea',
          defaultValue:
            'A curated boutique for the modern romantic - considered pieces, small-batch goods, and evenings worth dressing up for.',
        },
        {
          name: 'contactEmail',
          type: 'text',
        },
        {
          name: 'contactPhone',
          type: 'text',
        },
        {
          name: 'address',
          type: 'text',
          defaultValue: 'Brisbane, Australia',
        },
        {
          name: 'socialLinks',
          type: 'array',
          labels: { singular: 'Social Link', plural: 'Social Links' },
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
            {
              name: 'url',
              type: 'text',
            },
          ],
        },
      ],
    },
  ],
}
