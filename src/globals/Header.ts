import type { Field, GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

const linkFields = (allowChildren: boolean): Field[] => [
  {
    name: 'label',
    type: 'text' as const,
    required: true,
  },
  {
    name: 'linkType',
    type: 'select' as const,
    defaultValue: 'custom',
    options: [
      { label: 'A page you built', value: 'page' },
      { label: 'Custom URL', value: 'custom' },
    ],
  },
  {
    name: 'page',
    type: 'relationship' as const,
    relationTo: 'pages' as const,
    admin: {
      condition: (_: unknown, siblingData: Record<string, unknown>) => siblingData?.linkType === 'page',
    },
  },
  {
    name: 'customUrl',
    type: 'text' as const,
    admin: {
      description: 'e.g. /shop, /#about, or a full https:// link.',
      condition: (_: unknown, siblingData: Record<string, unknown>) => siblingData?.linkType !== 'page',
    },
  },
  {
    name: 'openInNewTab',
    type: 'checkbox' as const,
    defaultValue: false,
  },
  ...(allowChildren
    ? [
        {
          name: 'children',
          type: 'array' as const,
          labels: { singular: 'Dropdown Item', plural: 'Dropdown Items' },
          admin: { description: 'Optional - adding items here turns this into a dropdown menu.', initCollapsed: true },
          fields: linkFields(false),
        },
      ]
    : []),
]

export const Header: GlobalConfig = {
  slug: 'header',
  dbName: 'eg_header',
  label: 'Header',
  admin: {
    group: 'Settings',
    description:
      'Everything in the header: logo, menu (with dropdowns), announcement bar, socials, and mobile/desktop layout.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'showLogo', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'sticky', type: 'checkbox', defaultValue: true, admin: { width: '33%', description: 'Header stays visible while scrolling.' } },
        { name: 'showCart', type: 'checkbox', defaultValue: true, admin: { width: '33%', description: 'Only shown when the shop is turned on in Settings.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'desktopLayout',
          type: 'select',
          defaultValue: 'logo-left',
          admin: { width: '50%' },
          options: [
            { label: 'Logo left, menu right', value: 'logo-left' },
            { label: 'Logo centered, menu split around it', value: 'logo-center' },
            { label: 'Menu left, logo right', value: 'logo-right' },
          ],
        },
        {
          name: 'mobileLayout',
          type: 'select',
          defaultValue: 'slide-in',
          admin: { width: '50%' },
          options: [
            { label: 'Slide-in menu', value: 'slide-in' },
            { label: 'Full-screen overlay', value: 'fullscreen' },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'announcementBar',
      label: 'Announcement Bar',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false },
        { name: 'text', type: 'text', admin: { condition: (_, s) => Boolean(s?.enabled) } },
        { name: 'linkUrl', type: 'text', admin: { condition: (_, s) => Boolean(s?.enabled) } },
        { name: 'dismissible', type: 'checkbox', defaultValue: true, admin: { condition: (_, s) => Boolean(s?.enabled) } },
      ],
    },
    {
      name: 'menu',
      type: 'array',
      labels: { singular: 'Menu Item', plural: 'Menu Items' },
      admin: { initCollapsed: true },
      fields: linkFields(true),
    },
    {
      type: 'group',
      name: 'socials',
      fields: [
        { name: 'show', type: 'checkbox', defaultValue: false },
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
  ],
}
