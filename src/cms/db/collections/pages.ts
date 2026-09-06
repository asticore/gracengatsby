import type { Where } from '@/engine'

import { Pages } from '@/collections/Pages'

import { createCollectionOps, createVersionsOps } from '../generic'
import {
  pages,
  pagesBlockTypes,
  pagesGenerated,
  pagesRels,
  pagesRelsTargetColumns,
  pagesVersions,
  pagesVersionsBlockTypes,
  pagesVersionsRels,
  pagesVersionsRelsTargetColumns,
} from '../schema'

/** One block instance as Payload's own API returns it - see ./pageTemplates.ts's PageTemplateBlock doc comment, same idea. */
export type PageBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `pages` collection - see src/collections/Pages.ts. */
export type PageDoc = {
  id: number
  title: string
  isHomepage?: boolean | null
  slug?: string | null
  parent?: number | null
  template?: number | null
  seo?: { metaTitle?: string | null; metaDescription?: string | null; ogImage?: number | null; noIndex?: boolean | null }
  blocks?: PageBlock[] | null
  customFields?: unknown
  membersOnly?: { enabled?: boolean | null; tier?: number | null }
  _status?: string | null
  updatedAt: string
  createdAt: string
}

/**
 * One saved version of a Pages document. Unlike EventVersion (Phase 5's proof
 * target, which has no `blocks` field), this one DOES model `blocks` - each
 * version row's own block/rels child rows, scoped by the version row's own
 * id rather than the live document's (see ../generic.ts's createBlocksRelsOps
 * doc comment). A version block's `id` is that row's `_uuid` column, not its
 * internal autoincrement integer id - kept as `id` here so callers see the
 * same shape as a live PageBlock, matching ../schema/generate.ts's
 * generateBlockTables `versioned` param doc comment.
 */
export type PageVersion = {
  id: number
  parentId: number | null
  latest: boolean | null
  createdAt: string
  updatedAt: string
  versionUpdatedAt: string | null
  versionCreatedAt: string | null
  _status?: string | null
} & Omit<PageDoc, 'id' | 'updatedAt' | 'createdAt' | '_status'>

const ops = createCollectionOps(pages, Pages, {}, {
  relsTable: { table: pagesRels, targetColumns: pagesRelsTargetColumns },
  blocksFields: { blocks: { blockTypes: pagesBlockTypes } },
  groupFields: pagesGenerated.groupFields,
})

const versionsOps = createVersionsOps(pagesVersions, pagesGenerated.groupFields, {
  relsTable: { table: pagesVersionsRels, targetColumns: pagesVersionsRelsTargetColumns },
  blocksFields: { blocks: { blockTypes: pagesVersionsBlockTypes } },
})

export const findPages = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<PageDoc[]>
export const findPageByID = ops.findByID as unknown as (id: number) => Promise<PageDoc | null>
export const countPages = ops.count
export const createPage = ops.create as unknown as (
  data: Partial<Omit<PageDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string },
) => Promise<PageDoc>
export const updatePage = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<PageDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<PageDoc | null>
export const deletePage = ops.deleteByID

export const findLatestPageVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<PageVersion | null>
export const findPageVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<PageVersion[]>
export const createPageVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<PageDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<PageVersion>
