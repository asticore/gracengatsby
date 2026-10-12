import type { Field, GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { CARRIERS } from '../features/ecommerce/shipping/catalogue'
import { groupName } from '../features/ecommerce/shipping/registry'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Where parcels ship from, the box sizes used to build parcels, and each carrier's login keys.
 *
 * This is its own global (not part of shop-settings) because shop-settings is publicly readable and
 * carrier keys are not. The whole global is readable by admins only; secret keys are also encrypted at rest.
 * Edited on Shop settings > Shipping (/admin/shop-settings#shipping), which adds carrier links and Test buttons.
 */
const carrierGroup = (def: (typeof CARRIERS)[number]): Field => ({
  type: 'group',
  name: groupName(def.id),
  label: def.label,
  admin: { description: `${def.summary} ${def.keysHelp}` },
  fields: [
    { name: 'enabled', type: 'checkbox', defaultValue: false, admin: { description: `Use ${def.label} for live rates and labels.` } },
    { name: 'testMode', type: 'checkbox', defaultValue: true, admin: { description: 'Use the carrier\'s test (sandbox) environment. Use the matching test keys; real labels are not bought while this is on.' } },
    ...def.fields.map(
      (f): Field => ({
        name: f.key,
        type: 'text',
        label: f.label,
        ...(f.secret
          ? {
              access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess },
              hooks: { beforeChange: [encryptSecretHook], afterRead: [decryptSecretHook] },
            }
          : {}),
        admin: { description: `${f.help}${f.secret ? ' Stored encrypted and visible only to admins.' : ''}` },
      }),
    ),
  ],
})

export const ShippingSettings: GlobalConfig = {
  slug: 'shipping-settings',
  dbName: 'eg_shipping_settings',
  label: 'Shipping carriers',
  admin: {
    group: 'Settings',
    description: 'Ship-from address, package sizes and carrier keys. Use Shop settings > Shipping for the guided version with links and test buttons.',
  },
  access: {
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'origin',
      label: 'Ship-from address',
      admin: { description: 'Where parcels are sent from. Carriers need it to price a parcel and print a label.' },
      fields: [
        { name: 'name', type: 'text', admin: { description: 'Contact name on the label.' } },
        { name: 'company', type: 'text' },
        { name: 'line1', type: 'text', label: 'Address line 1' },
        { name: 'line2', type: 'text', label: 'Address line 2' },
        { name: 'city', type: 'text', label: 'Suburb / city' },
        { name: 'state', type: 'text', admin: { description: 'State or territory, for example NSW.' } },
        { name: 'postcode', type: 'text' },
        { name: 'country', type: 'text', defaultValue: 'AU', admin: { description: 'Two-letter country code.' } },
        { name: 'phone', type: 'text' },
        { name: 'email', type: 'email' },
      ],
    },
    {
      type: 'group',
      name: 'rates',
      label: 'Live rates',
      admin: { description: 'Show real carrier prices at checkout. If a carrier cannot be reached, your shipping zone rates are used instead, so checkout never stops.' },
      fields: [
        { name: 'liveRates', type: 'checkbox', defaultValue: false, admin: { description: 'Ask the enabled carriers for prices at checkout. Needs a complete ship-from address.' } },
        { name: 'handlingFlat', type: 'number', min: 0, defaultValue: 0, admin: { description: 'Dollars added to every live rate, for packing materials or handling.' } },
        { name: 'handlingPct', type: 'number', min: 0, defaultValue: 0, admin: { description: 'Percent added to every live rate.' } },
        { name: 'taxable', type: 'checkbox', defaultValue: true, admin: { description: 'Charge GST on live shipping rates.' } },
      ],
    },
    {
      name: 'packages',
      type: 'json',
      admin: {
        description:
          'Box sizes as a list. Each: {"name":"Medium box","lengthCm":30,"widthCm":25,"heightCm":15,"maxWeightKg":5,"tareKg":0.2}. Sizes are always centimetres and kilograms, whatever unit display you chose.',
      },
    },
    ...CARRIERS.map(carrierGroup),
  ],
}
