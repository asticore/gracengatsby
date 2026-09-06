import type { Where } from '@/engine'

import { PageTemplates } from '@/collections/PageTemplates'

import { createCollectionOps } from '../generic'
import { pageTemplates, pageTemplatesBlockTypes, pageTemplatesRels, pageTemplatesRelsTargetColumns } from '../schema'

/**
 * One block instance as Payload's own API returns it - `blockType` picks the
 * shape, `id` and `blockName` are Payload's own per-instance bookkeeping
 * (confirmed against a real eg_page_templates_blocks_* row: `id` is a
 * generated string, `blockName` is nullable and separate from the block's own
 * declared fields), and everything else is that block's own fields. Typed
 * loosely on purpose - see src/blocks/*.ts for each block's real field list;
 * this data layer does not need to know their shapes beyond what generates
 * their table, only pass them through.
 */
export type PageTemplateBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `page-templates` collection - see src/collections/PageTemplates.ts. */
export type PageTemplateDoc = {
  id: number
  name: string
  description?: string | null
  blocks?: PageTemplateBlock[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(pageTemplates, PageTemplates, {}, {
  relsTable: { table: pageTemplatesRels, targetColumns: pageTemplatesRelsTargetColumns },
  blocksFields: { blocks: { blockTypes: pageTemplatesBlockTypes } },
})

export const findPageTemplates = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<PageTemplateDoc[]>
export const findPageTemplateByID = ops.findByID as unknown as (id: number) => Promise<PageTemplateDoc | null>
export const countPageTemplates = ops.count
export const createPageTemplate = ops.create as unknown as (
  data: Partial<Omit<PageTemplateDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string },
) => Promise<PageTemplateDoc>
export const updatePageTemplate = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<PageTemplateDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<PageTemplateDoc | null>
export const deletePageTemplate = ops.deleteByID
