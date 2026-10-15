import type { Sort, Where } from '@/engine'

import { SiteTemplates, type SiteTemplateKind } from '@/collections/SiteTemplates'

import { createCollectionOps } from '../generic'
import { siteTemplates, siteTemplatesBlockTypes, siteTemplatesRels, siteTemplatesRelsTargetColumns } from '../schema/siteTemplates'

/** One block instance as stored - same loose shape as PageTemplateBlock, see ./pageTemplates.ts. */
export type SiteTemplateBlockNode = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** The document shape for the `site-templates` collection - see src/collections/SiteTemplates.ts. */
export type SiteTemplateDoc = {
  id: number
  name: string
  kind: SiteTemplateKind
  enabled?: boolean | null
  priority?: number | null
  /** Groups of rules: OR between groups, AND inside a group (src/features/customFields/location.ts). */
  conditions?: unknown
  blocks?: SiteTemplateBlockNode[] | null
  /** Section locks (src/features/roles/locks.ts). */
  locks?: unknown
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(siteTemplates, SiteTemplates, {}, {
  relsTable: { table: siteTemplatesRels, targetColumns: siteTemplatesRelsTargetColumns },
  blocksFields: { blocks: { blockTypes: siteTemplatesBlockTypes } },
})

export const findSiteTemplates = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<SiteTemplateDoc[]>
export const findSiteTemplateByID = ops.findByID as unknown as (id: number) => Promise<SiteTemplateDoc | null>
export const countSiteTemplates = ops.count
export const createSiteTemplate = ops.create as unknown as (
  data: Partial<Omit<SiteTemplateDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string; kind: SiteTemplateKind },
) => Promise<SiteTemplateDoc>
export const updateSiteTemplate = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<SiteTemplateDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<SiteTemplateDoc | null>
export const deleteSiteTemplate = ops.deleteByID

// The paginated find shape the engine cutover's adapter intercept needs - same pattern as pageTemplates.ts.
export const findSiteTemplatesPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
