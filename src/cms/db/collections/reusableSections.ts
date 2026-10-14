import type { Sort, Where } from '@/engine'

import { ReusableSections } from '@/collections/ReusableSections'

import { createCollectionOps } from '../generic'
import { reusableSections, reusableSectionsBlockTypes, reusableSectionsRels, reusableSectionsRelsTargetColumns } from '../schema/reusableSections'

/** One block instance as stored - same loose shape as PageTemplateBlock, see ./pageTemplates.ts. */
export type ReusableSectionBlockNode = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** The document shape for the `reusable-sections` collection - see src/collections/ReusableSections.ts. */
export type ReusableSectionDoc = {
  id: number
  name: string
  description?: string | null
  blocks?: ReusableSectionBlockNode[] | null
  /** Section locks (src/features/roles/locks.ts). */
  locks?: unknown
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(reusableSections, ReusableSections, {}, {
  relsTable: { table: reusableSectionsRels, targetColumns: reusableSectionsRelsTargetColumns },
  blocksFields: { blocks: { blockTypes: reusableSectionsBlockTypes } },
})

export const findReusableSections = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<ReusableSectionDoc[]>
export const findReusableSectionByID = ops.findByID as unknown as (id: number) => Promise<ReusableSectionDoc | null>
export const countReusableSections = ops.count
export const createReusableSection = ops.create as unknown as (
  data: Partial<Omit<ReusableSectionDoc, 'id' | 'updatedAt' | 'createdAt'>> & { name: string },
) => Promise<ReusableSectionDoc>
export const updateReusableSection = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<ReusableSectionDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ReusableSectionDoc | null>
export const deleteReusableSection = ops.deleteByID

// The paginated find shape the engine cutover's adapter intercept needs - same pattern as pageTemplates.ts.
export const findReusableSectionsPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
