import type { CollectionConfig } from '@/engine'

import { shopAccess } from '../access'

/**
 * A shipping zone: where it applies (ordered regions) and how to ship there
 * (methods). Zones are tried in `order`; the first match wins. A zone with no
 * regions matches everywhere (a "rest of world" zone). Money fields are whole
 * dollars, like product prices.
 */
export const ShippingZones: CollectionConfig = {
  slug: 'shipping-zones',
  dbName: 'eg_shipping_zones',
  labels: { singular: 'Shipping zone', plural: 'Shipping zones' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'name',
    defaultColumns: ['name', 'order', 'updatedAt'],
    description: 'Where you ship and what it costs. The first zone (lowest order) that matches the customer address is used.',
  },
  access: {
    create: shopAccess('shipping-zones', 'create'),
    read: shopAccess('shipping-zones', 'read'),
    update: shopAccess('shipping-zones', 'update'),
    delete: shopAccess('shipping-zones', 'delete'),
  },
  defaultSort: 'order',
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'order', type: 'number', defaultValue: 0, admin: { description: 'Lower numbers are checked first.', position: 'sidebar' } },
    {
      name: 'regions',
      type: 'array',
      labels: { singular: 'Region', plural: 'Regions' },
      admin: { description: 'Leave empty to match every address. Postcodes: exact (2000), range (2000-2999) or wildcard (20*), comma separated.' },
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'country',
          options: [
            { label: 'Country', value: 'country' },
            { label: 'State / region', value: 'state' },
            { label: 'Postcodes', value: 'postcode' },
          ],
        },
        { name: 'country', type: 'text', required: true, defaultValue: 'AU', admin: { description: 'ISO country code, e.g. AU.' } },
        { name: 'value', type: 'text', admin: { description: 'State code (NSW) or postcode list. Not needed for a whole country.' } },
      ],
    },
    {
      name: 'methods',
      type: 'array',
      labels: { singular: 'Method', plural: 'Methods' },
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'flat',
          options: [
            { label: 'Flat rate', value: 'flat' },
            { label: 'Free over amount', value: 'free_over_amount' },
            { label: 'Local pickup', value: 'local_pickup' },
            { label: 'Table rate', value: 'table_rate' },
          ],
        },
        { name: 'title', type: 'text', required: true },
        { name: 'cost', type: 'number', min: 0, admin: { description: 'Flat rate / pickup cost in dollars.' } },
        { name: 'taxable', type: 'checkbox', defaultValue: true, admin: { description: 'Charge GST/tax on this shipping cost.' } },
        { name: 'freeOver', type: 'number', min: 0, admin: { description: 'Free over amount: free once the cart subtotal reaches this many dollars.' } },
        {
          name: 'tableBasis',
          type: 'select',
          defaultValue: 'weight',
          options: [
            { label: 'Total weight (kg)', value: 'weight' },
            { label: 'Cart subtotal ($)', value: 'subtotal' },
            { label: 'Item count', value: 'item_count' },
          ],
        },
        { name: 'enabled', type: 'checkbox', defaultValue: true },
        {
          name: 'tableRates',
          type: 'array',
          labels: { singular: 'Rate row', plural: 'Rate rows' },
          admin: { description: 'Table rate only. The first row the basis falls inside (min to max inclusive; max 0 = no upper limit) sets the cost.' },
          fields: [
            { name: 'min', type: 'number', defaultValue: 0 },
            { name: 'max', type: 'number', defaultValue: 0 },
            { name: 'cost', type: 'number', min: 0, required: true },
          ],
        },
        {
          name: 'classSurcharges',
          type: 'array',
          labels: { singular: 'Class surcharge', plural: 'Class surcharges' },
          admin: { description: 'Extra dollars per item whose shipping class matches (flat and table rate).' },
          fields: [
            { name: 'shippingClass', type: 'text', required: true, admin: { description: 'The shipping class id (see Shipping classes).' } },
            { name: 'cost', type: 'number', min: 0, required: true },
          ],
        },
      ],
    },
  ],
}
