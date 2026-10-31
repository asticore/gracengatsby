import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { embedShortLinksFor } from '@/features/embeds/hooks'
import { locksField } from '../fields/locks'
import { lockGuard } from '@/features/roles/lockGuard'

export const TEMPLATE_CATEGORIES = [
  'hero',
  'features',
  'cta',
  'gallery',
  'testimonials',
  'pricing',
  'team',
  'faq',
  'contact',
  'shop',
  'blog',
  'header',
  'footer',
  'other',
] as const

export const PageTemplates: CollectionConfig = {
  slug: 'page-templates',
  dbName: 'eg_page_templates',
  labels: { singular: 'Page Template', plural: 'Page Templates' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'category', 'description', 'locks'],
    group: 'Content',
    description:
      'Starter layouts for new pages. Build one here, then pick it from the "Start from template" field when creating a new Page - its sections get copied in.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton', '@/fields/locks/DocumentLockControl#DocumentLockControl'],
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
      name: 'kind',
      type: 'select',
      defaultValue: 'page',
      options: [
        { label: 'Page', value: 'page' },
        { label: 'Section', value: 'section' },
      ],
      admin: { description: 'Page templates are offered when starting a new page; section templates are dropped into an existing page.' },
    },
    {
      name: 'category',
      type: 'select',
      defaultValue: 'other',
      options: TEMPLATE_CATEGORIES.map((value) => ({ label: value.charAt(0).toUpperCase() + value.slice(1), value })),
    },
    { name: 'previewImage', type: 'upload', relationTo: 'media', admin: { description: 'Optional thumbnail shown in the editor template browser.' } },
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
    beforeChange: [lockGuard, embedShortLinksFor('blocks')],
  },
}
