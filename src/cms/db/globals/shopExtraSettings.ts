import { ShopExtraSettings } from '@/globals/ShopExtraSettings'

import { createGlobalOps } from '../generic'
import { shopExtraSettings, shopExtraSettingsPricingRules } from '../schema'

/**
 * The `shop-extra-settings` global (src/globals/ShopExtraSettings.ts): one row, flat scalar fields only.
 * `preordersEnabled` is the shop-wide pre-order switch. A missing row or value means the default (on).
 */
export type ShopExtraSettingsDoc = {
  id: number
  preordersEnabled?: boolean | null
  /** Customers also bought on product pages and in the cart (see features/ecommerce/server/recommendations.ts). */
  recommendationsEnabled?: boolean | null
  recommendationsMax?: number | null
  /** Product add-ons and dynamic pricing rules (lib/addOns.ts, lib/pricingRules.ts). A missing value means the default (on). */
  addOnsEnabled?: boolean | null
  pricingRulesEnabled?: boolean | null
  pricingRules?: Record<string, unknown>[] | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(shopExtraSettings, ShopExtraSettings, { pricingRules: shopExtraSettingsPricingRules }, {})

export const findShopExtraSettings = ops.find as unknown as () => Promise<ShopExtraSettingsDoc | null>
export const updateShopExtraSettings = ops.update as unknown as (
  data: Partial<Omit<ShopExtraSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ShopExtraSettingsDoc>
