import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const ShopSettings: GlobalConfig = {
  slug: 'shop-settings',
  admin: {
    group: 'Shop',
    description:
      'Layout for the shop archive (/shop) and product pages. Turn ecommerce on/off in Settings > Features. Click "Edit visually" above to build the intro section on a drag-and-drop canvas.',
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
    {
      name: 'introBlocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Shown above the product grid on /shop - build it visually with "Edit visually" above.',
        initCollapsed: true,
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'archiveLayout',
          type: 'select',
          defaultValue: 'grid-4',
          admin: { width: '50%' },
          options: [
            { label: 'Grid - 3 columns', value: 'grid-3' },
            { label: 'Grid - 4 columns', value: 'grid-4' },
            { label: 'List', value: 'list' },
          ],
        },
        { name: 'showCategoryFilters', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'showRelatedProducts', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'showShortDescriptionOnCard', type: 'checkbox', defaultValue: false, admin: { width: '33%' } },
        { name: 'productImageAspect', type: 'select', defaultValue: 'portrait', admin: { width: '33%' }, options: [
          { label: 'Portrait', value: 'portrait' },
          { label: 'Square', value: 'square' },
        ] },
      ],
    },
  ],
}
