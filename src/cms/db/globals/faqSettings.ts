import { FaqSettings } from '@/globals/FaqSettings'

import { createGlobalOps } from '../generic'
import { faqSettings, faqSettingsBlockTypes, faqSettingsRels, faqSettingsRelsTargetColumns } from '../schema'

/**
 * One `introBlocks` block instance as Payload's own API returns it - same
 * loosely-typed shape as PageTemplateBlock (../collections/pageTemplates.ts)
 * and every other blocks-field block type in this data layer; see
 * src/blocks/*.ts for each block's own real field list.
 */
export type FaqSettingsBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `faq-settings` global - see src/globals/FaqSettings.ts. */
export type FaqSettingsDoc = {
  id: number
  pageTitle?: string | null
  intro?: string | null
  introBlocks?: FaqSettingsBlock[] | null
  layout?: string | null
  groupByCategory?: boolean | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(faqSettings, FaqSettings, {}, {
  relsTable: { table: faqSettingsRels, targetColumns: faqSettingsRelsTargetColumns },
  blocksFields: { introBlocks: { blockTypes: faqSettingsBlockTypes } },
})

export const findFaqSettings = ops.find as unknown as () => Promise<FaqSettingsDoc | null>
export const updateFaqSettings = ops.update as unknown as (
  data: Partial<Omit<FaqSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FaqSettingsDoc>
