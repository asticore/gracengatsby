import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const BlogSettings: GlobalConfig = {
  slug: 'blog-settings',
  dbName: 'eg_blog_settings',
  label: 'Blog',
  admin: {
    group: 'Settings',
    description:
      'Layout for the blog archive (/blog) and individual posts. Turn the blog on/off in Settings > Features. Click "Edit visually" above to build the intro section on a drag-and-drop canvas.',
    components: {
      elements: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'archiveTitle', type: 'text', defaultValue: 'Journal' },
    { name: 'archiveIntro', type: 'textarea' },
    {
      name: 'introBlocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Shown above the post grid on /blog - build it visually with "Edit visually" above.',
        initCollapsed: true,
      },
    },
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
