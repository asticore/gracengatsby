import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Shop-wide switches that do not fit in Shop settings (eg_shop_settings is at the D1 limit of 100 columns, so new
 * toggles live here). Add a future toggle as a new top-level field; every reader treats a missing value as the default.
 */
export const ShopExtraSettings: GlobalConfig = {
  slug: 'shop-extra-settings',
  label: 'Shop switches',
  dbName: 'eg_shop_extra_settings',
  admin: {
    group: 'Settings',
    description: 'Shop-wide switches. Shown and edited on the Shop settings page.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'preordersEnabled',
      type: 'checkbox',
      label: 'Allow pre-orders in the shop',
      defaultValue: true,
      admin: {
        description:
          'Allow pre-orders across the whole shop. Turn this off to stop selling pre-order products straight away: they show as out of stock and cannot be added to a cart. Products keep their pre-order settings, so turning it back on restores them.',
      },
    },
  ],
}
