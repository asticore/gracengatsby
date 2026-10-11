import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { slugify } from '../slugify'

/** Groups of products that ship alike (Bulky, Fragile ...). Shipping zones use the class to pick a rate; products point at one. */
export const ShippingClasses: CollectionConfig = {
  slug: 'shipping-classes',
  dbName: 'eg_shipping_classes',
  labels: { singular: 'Shipping class', plural: 'Shipping classes' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'updatedAt'],
  },
  access: {
    create: roleAccess('shipping-classes', 'create'),
    read: () => true,
    update: roleAccess('shipping-classes', 'update'),
    delete: roleAccess('shipping-classes', 'delete'),
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', unique: true, index: true },
    { name: 'description', type: 'textarea' },
  ],  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && typeof data.name === 'string' && !(typeof data.slug === 'string' && data.slug.trim())) data.slug = slugify(data.name)
        return data
      },
    ],
  },
}
