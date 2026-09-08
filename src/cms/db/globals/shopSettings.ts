import { ShopSettings } from '@/globals/ShopSettings'

import { createGlobalOps } from '../generic'
import { shopSettings, shopSettingsBlockTypes, shopSettingsRels, shopSettingsRelsTargetColumns } from '../schema'

/**
 * One `introBlocks` block instance as Payload's own API returns it - same
 * loosely-typed shape as PageTemplateBlock (../collections/pageTemplates.ts)
 * and every other blocks-field block type in this data layer; see
 * src/blocks/*.ts for each block's own real field list.
 */
export type ShopSettingsBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `shop-settings` global - see src/globals/ShopSettings.ts. */
export type ShopSettingsDoc = {
  id: number
  introBlocks?: ShopSettingsBlock[] | null
  archiveLayout?: string | null
  showCategoryFilters?: boolean | null
  showRelatedProducts?: boolean | null
  showShortDescriptionOnCard?: boolean | null
  productImageAspect?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(shopSettings, ShopSettings, {}, {
  relsTable: { table: shopSettingsRels, targetColumns: shopSettingsRelsTargetColumns },
  blocksFields: { introBlocks: { blockTypes: shopSettingsBlockTypes } },
})

export const findShopSettings = ops.find as unknown as () => Promise<ShopSettingsDoc | null>
export const updateShopSettings = ops.update as unknown as (
  data: Partial<Omit<ShopSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ShopSettingsDoc>
