import type { Block } from 'payload'

import { blockStyleField } from './styleField'

export const ProductGridBlock: Block = {
  slug: 'productGrid',
  labels: { singular: 'Product Grid', plural: 'Product Grid Blocks' },
  fields: [
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'category',
      type: 'select',
      admin: { description: 'Leave blank to show products from every category.' },
      options: [
        { label: 'Apparel', value: 'apparel' },
        { label: 'Accessories', value: 'accessories' },
        { label: 'Jewellery', value: 'jewellery' },
        { label: 'Homeware', value: 'homeware' },
        { label: 'Gifting', value: 'gifting' },
      ],
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 4,
      min: 1,
      max: 24,
    },
    blockStyleField,
  ],
}
