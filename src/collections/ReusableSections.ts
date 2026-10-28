import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { locksField } from '../fields/locks'
import { lockGuard } from '@/features/roles/lockGuard'

/**
 * Reusable sections: a block list built once and shown wherever a Reusable
 * section block points at it. Edits here are live everywhere it is used.
 */
export const ReusableSections: CollectionConfig = {
  slug: 'reusable-sections',
  dbName: 'eg_reusable_sections',
  labels: { singular: 'Reusable section', plural: 'Reusable sections' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'description', 'locks'],
    group: 'Content',
    description:
      'Sections you use on many pages. Build one here, then add it to a page with the "Reusable section" block. Edits here update every page that uses it.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton', '@/fields/locks/DocumentLockControl#DocumentLockControl'],
      },
    },
  },
  access: {
    create: roleAccess('reusable-sections', 'create'),
    delete: roleAccess('reusable-sections', 'delete'),
    read: roleAccess('reusable-sections', 'read'),
    update: roleAccess('reusable-sections', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'description', type: 'text', admin: { description: 'Shown to help you find the right section.' } },
    {
      name: 'blocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
    locksField,
  ],
  hooks: {
    beforeChange: [lockGuard],
  },
}
