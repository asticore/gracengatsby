import { ShopSettings } from '@/globals/ShopSettings'

import { createGlobalOps } from '../generic'
import { shopSettings, shopSettingsBlockTypes, shopSettingsCheckoutFields, shopSettingsGroupFields, shopSettingsRels, shopSettingsRelsTargetColumns } from '../schema'

/**
 * One `introBlocks` block instance as the original engine's own API returns it - same
 * loosely-typed shape as PageTemplateBlock (../collections/pageTemplates.ts)
 * and every other blocks-field block type in this data layer; see
 * src/blocks/*.ts for each block's own real field list.
 */
export type ShopSettingsBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** The original engine's document shape for the `shop-settings` global - see src/globals/ShopSettings.ts. */
export type ShopSettingsDoc = {
  id: number
  introBlocks?: ShopSettingsBlock[] | null
  archiveLayout?: string | null
  showCategoryFilters?: boolean | null
  showRelatedProducts?: boolean | null
  showShortDescriptionOnCard?: boolean | null
  productImageAspect?: string | null
  tax?: Record<string, unknown> | null
  emails?: Record<string, unknown> | null
  abandonedCart?: Record<string, unknown> | null
  checkoutFields?: Record<string, unknown>[] | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(shopSettings, ShopSettings, { checkoutFields: shopSettingsCheckoutFields }, {
  groupFields: shopSettingsGroupFields,
  relsTable: { table: shopSettingsRels, targetColumns: shopSettingsRelsTargetColumns },
  blocksFields: { introBlocks: { blockTypes: shopSettingsBlockTypes } },
})

export const findShopSettings = ops.find as unknown as () => Promise<ShopSettingsDoc | null>
export const updateShopSettings = ops.update as unknown as (
  data: Partial<Omit<ShopSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ShopSettingsDoc>
