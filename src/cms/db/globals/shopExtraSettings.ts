import { ShopExtraSettings } from '@/globals/ShopExtraSettings'

import { createGlobalOps } from '../generic'
import { shopExtraSettings } from '../schema'

/**
 * The `shop-extra-settings` global (src/globals/ShopExtraSettings.ts): one row, flat scalar fields only.
 * `preordersEnabled` is the shop-wide pre-order switch. A missing row or value means the default (on).
 */
export type ShopExtraSettingsDoc = {
  id: number
  preordersEnabled?: boolean | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(shopExtraSettings, ShopExtraSettings, {}, {})

export const findShopExtraSettings = ops.find as unknown as () => Promise<ShopExtraSettingsDoc | null>
export const updateShopExtraSettings = ops.update as unknown as (
  data: Partial<Omit<ShopExtraSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ShopExtraSettingsDoc>
