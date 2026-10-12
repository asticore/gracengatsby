import type { CollectionConfig } from '@/engine'

import { shopAccess } from '../access'

/**
 * A driver manifest: the batch of labelled parcels handed to a carrier or courier in one go. Created from the
 * orders list ("Create manifest") through POST /api/admin-shop-manifest; the printable page and the CSV are
 * built from the orders it lists. Rows are a record of what was handed over, so they are not edited by hand.
 */
export const ShippingManifests: CollectionConfig = {
  slug: 'shipping-manifests',
  dbName: 'eg_shipping_manifests',
  labels: { singular: 'Shipping manifest', plural: 'Shipping manifests' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'number',
    defaultColumns: ['number', 'carrier', 'orderCount', 'parcelCount', 'status', 'createdAt'],
    description: 'Batches of parcels handed to a carrier. Open the printable manifest or the CSV from the orders screen.',
  },
  access: {
    create: shopAccess('shipping-manifests', 'create'),
    read: shopAccess('shipping-manifests', 'read'),
    update: shopAccess('shipping-manifests', 'update'),
    delete: shopAccess('shipping-manifests', 'delete'),
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    { name: 'number', type: 'text', unique: true, index: true, admin: { readOnly: true, description: 'For example M-20261014-0001.' } },
    { name: 'carrier', type: 'text', admin: { description: 'Carrier or courier the parcels were handed to. Blank for all carriers.' } },
    { name: 'orderIds', type: 'json', admin: { readOnly: true } },
    { name: 'orderCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'parcelCount', type: 'number', defaultValue: 0, admin: { readOnly: true } },
    { name: 'weightKg', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Kilograms.' } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      index: true,
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Handed over', value: 'handed-over' },
      ],
    },
    { name: 'carrierReference', type: 'text', admin: { description: 'The carrier\'s own manifest reference, when it gave one.' } },
    { name: 'carrierMessage', type: 'text', admin: { readOnly: true } },
    { name: 'note', type: 'textarea' },
  ],
}
