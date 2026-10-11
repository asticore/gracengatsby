import type { CollectionConfig } from '@/engine'

import { shopAccess } from '../access'

export const TaxRates: CollectionConfig = {
  slug: 'tax-rates',
  dbName: 'eg_tax_rates',
  labels: { singular: 'Tax rate', plural: 'Tax rates' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'name',
    defaultColumns: ['name', 'taxClass', 'country', 'state', 'ratePct', 'priority'],
    description:
      'Optional. With no rows, the store GST rate from Shop settings applies to the standard class in your default country. Add a row to override it or to tax other regions.',
  },
  access: {
    create: shopAccess('tax-rates', 'create'),
    read: shopAccess('tax-rates', 'read'),
    update: shopAccess('tax-rates', 'update'),
    delete: shopAccess('tax-rates', 'delete'),
  },
  defaultSort: 'priority',
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true, defaultValue: 'GST' },
    {
      name: 'taxClass',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Standard', value: 'standard' },
        { label: 'Reduced', value: 'reduced' },
        { label: 'Zero', value: 'zero' },
      ],
    },
    { name: 'country', type: 'text', admin: { description: 'ISO code such as AU. Empty or * matches every country.' } },
    { name: 'state', type: 'text', admin: { description: 'State code. Empty or * matches every state.' } },
    { name: 'ratePct', type: 'number', required: true, min: 0, max: 100, admin: { description: 'Percent, e.g. 10 for 10%.' } },
    { name: 'shippingTaxable', type: 'checkbox', defaultValue: true },
    { name: 'priority', type: 'number', defaultValue: 1, admin: { description: 'One rate per priority applies; different priorities stack.' } },
  ],
}
