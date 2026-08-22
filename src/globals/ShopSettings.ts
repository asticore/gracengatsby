import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const ShopSettings: GlobalConfig = {
  slug: 'shop-settings',
  admin: {
    group: 'Shop',
    description: 'Layout for the shop archive (/shop) and product pages. Turn ecommerce on/off in Settings > Features.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
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
