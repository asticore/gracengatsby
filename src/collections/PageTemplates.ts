import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const PageTemplates: CollectionConfig = {
  slug: 'page-templates',
  labels: { singular: 'Page Template', plural: 'Page Templates' },
  admin: {
    useAsTitle: 'name',
    group: 'Site Settings',
    description:
      'Starter layouts for new pages. Build one here, then pick it from the "Start from template" field when creating a new Page - its sections get copied in.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text', admin: { description: 'Shown to help you pick the right template.' } },
    {
      name: 'blocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
    },
  ],
}
