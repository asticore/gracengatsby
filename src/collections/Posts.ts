import type { CollectionConfig } from 'payload'

import { adminOrPublishedStatus, isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { seoFields } from '../fields/seo'
import { formatSlugHook } from '../utilities/formatSlug'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedDate', '_status'],
    group: 'Blog',
    description: 'Blog posts. Turn the blog on/off in Settings > Features. Click "Edit visually" above to add extra sections on a drag-and-drop canvas.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: adminOrPublishedStatus,
    update: isAdmin,
  },
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the title as you type - edit it here to override. -> /blog/<slug>',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: { beforeValidate: [formatSlugHook('title')] },
    },
    { name: 'publishedDate', type: 'date', defaultValue: () => new Date().toISOString(), admin: { position: 'sidebar' } },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    { name: 'categories', type: 'array', labels: { singular: 'Category', plural: 'Categories' }, fields: [{ name: 'name', type: 'text' }], admin: { position: 'sidebar', initCollapsed: true } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Shown on the blog archive card.' } },
    { name: 'content', type: 'richText', required: true },
    {
      name: 'layout',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Extra visually-editable sections shown below the post content (galleries, CTAs, etc).',
        initCollapsed: true,
      },
    },
    seoFields,
  ],
}
