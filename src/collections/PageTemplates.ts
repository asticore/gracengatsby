import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const PageTemplates: CollectionConfig = {
  slug: 'page-templates',
  dbName: 'eg_page_templates',
  labels: { singular: 'Page Template', plural: 'Page Templates' },
  admin: {
    useAsTitle: 'name',
    group: 'Content',
    description:
      'Starter layouts for new pages. Build one here, then pick it from the "Start from template" field when creating a new Page - its sections get copied in.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: roleAccess('page-templates', 'create'),
    delete: roleAccess('page-templates', 'delete'),
    read: roleAccess('page-templates', 'read'),
    update: roleAccess('page-templates', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text', admin: { description: 'Shown to help you pick the right template.' } },
    {
      name: 'blocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
  ],
}
