import type { GlobalConfig } from '@/engine'

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
    {
      type: 'row',
      fields: [
        {
          name: 'authorArchives',
          type: 'checkbox',
          defaultValue: true,
          admin: { width: '50%', description: 'Author archive pages. When off, the author name shows as plain text with no link, /blog/author/<slug> returns 404 and authors are left out of the sitemap.' },
        },
        {
          name: 'showAuthors',
          type: 'checkbox',
          defaultValue: true,
          admin: { width: '50%', description: 'Show post authors: the byline, author links and /blog/author/<name> pages. Turn off to hide authors across the whole blog. Changes show once cached pages refresh.' },
        },
        {
          name: 'showTags',
          type: 'checkbox',
          defaultValue: true,
          admin: { width: '50%', description: 'Show post tags: tag links on posts and /blog/tag/<tag> pages. Turn off to hide tags across the whole blog. Changes show once cached pages refresh.' },
        },
      ],
    },
  ],
}
