import type { CollectionConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'
import { customFieldsField } from '../fields/customFields'

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  dbName: 'eg_faqs',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'order'],
    group: 'Content',
    description: 'Reusable Q&A entries. Show them on the site FAQ page, or drop the FAQ block into any page/product.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'question', type: 'text', required: true },
    { name: 'answer', type: 'richText', required: true },
    {
      name: 'category',
      type: 'text',
      admin: { position: 'sidebar', description: 'e.g. Shipping, Returns, Events. Used to group/filter FAQs.' },
    },
    { name: 'order', type: 'number', defaultValue: 0, admin: { position: 'sidebar', description: 'Lower numbers show first.' } },
    customFieldsField,
  ],
  defaultSort: 'order',
}
