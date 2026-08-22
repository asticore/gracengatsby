import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const BlogSettings: GlobalConfig = {
  slug: 'blog-settings',
  admin: {
    group: 'Blog',
    description: 'Layout for the blog archive (/blog) and individual posts. Turn the blog on/off in Settings > Features.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'archiveTitle', type: 'text', defaultValue: 'Journal' },
    { name: 'archiveIntro', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'archiveLayout',
          type: 'select',
          defaultValue: 'grid',
          admin: { width: '33%' },
          options: [
            { label: 'Grid', value: 'grid' },
            { label: 'List', value: 'list' },
            { label: 'Magazine (featured + grid)', value: 'magazine' },
          ],
        },
        { name: 'postsPerPage', type: 'number', defaultValue: 9, admin: { width: '33%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'showAuthor', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'showDate', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'showCategories', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
      ],
    },
  ],
}
