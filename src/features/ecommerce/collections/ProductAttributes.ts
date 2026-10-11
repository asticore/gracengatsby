import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { slugify } from '../slugify'

/**
 * Global product attributes (Colour, Size, Material ...) with their terms. A product picks one of
 * these on its Attributes tab, or defines a custom attribute of its own. Terms are plain text rows
 * so the shop can show them as dropdowns, colour swatches or buttons.
 */
export const ProductAttributes: CollectionConfig = {
  slug: 'product-attributes',
  dbName: 'eg_product_attributes',
  labels: { singular: 'Product attribute', plural: 'Product attributes' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'updatedAt'],
    description: 'Reusable options such as Colour or Size. Pick them on a product to build variations.',
  },
  access: {
    create: roleAccess('product-attributes', 'create'),
    read: () => true,
    update: roleAccess('product-attributes', 'update'),
    delete: roleAccess('product-attributes', 'delete'),
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', index: true, admin: { position: 'sidebar' } },
    {
      name: 'type',
      type: 'select',
      defaultValue: 'select',
      admin: { position: 'sidebar', description: 'How the choices appear on the product page.' },
      options: [
        { label: 'Dropdown', value: 'select' },
        { label: 'Colour swatches', value: 'color' },
        { label: 'Buttons', value: 'button' },
      ],
    },
    {
      name: 'terms',
      type: 'array',
      labels: { singular: 'Term', plural: 'Terms' },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'slug', type: 'text' },
        { name: 'swatch', type: 'text', admin: { description: 'A colour such as #c0392b, for colour swatches.' } },
      ],
    },
  ],  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && typeof data.name === 'string' && !(typeof data.slug === 'string' && data.slug.trim())) data.slug = slugify(data.name)
        return data
      },
    ],
  },
}
