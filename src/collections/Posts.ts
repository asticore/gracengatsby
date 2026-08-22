import type { CollectionConfig } from 'payload'

import { adminOrPublishedStatus, isAdmin } from '../access/ecommerceAccess'
import { seoFields } from '../fields/seo'
import { formatSlugHook } from '../utilities/formatSlug'

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Post', plural: 'Posts' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publishedDate', '_status'],
    group: 'Blog',
    description: 'Blog posts. Turn the blog on/off in Settings > Features.',
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
      required: true,
      unique: true,
      admin: { position: 'sidebar', description: 'Auto-generated from the title if left blank. -> /blog/<slug>' },
      hooks: { beforeValidate: [formatSlugHook('title')] },
    },
    { name: 'publishedDate', type: 'date', defaultValue: () => new Date().toISOString(), admin: { position: 'sidebar' } },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    { name: 'categories', type: 'array', labels: { singular: 'Category', plural: 'Categories' }, fields: [{ name: 'name', type: 'text' }], admin: { position: 'sidebar' } },
    { name: 'featuredImage', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Shown on the blog archive card.' } },
    { name: 'content', type: 'richText', required: true },
    seoFields,
  ],
}
