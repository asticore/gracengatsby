import { BlogSettings } from '@/globals/BlogSettings'

import { createGlobalOps } from '../generic'
import { blogSettings, blogSettingsBlockTypes, blogSettingsRels, blogSettingsRelsTargetColumns } from '../schema'

/**
 * One `introBlocks` block instance as Payload's own API returns it - same
 * loosely-typed shape as PageTemplateBlock (../collections/pageTemplates.ts)
 * and every other blocks-field block type in this data layer; see
 * src/blocks/*.ts for each block's own real field list.
 */
export type BlogSettingsBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `blog-settings` global - see src/globals/BlogSettings.ts. */
export type BlogSettingsDoc = {
  id: number
  archiveTitle?: string | null
  archiveIntro?: string | null
  introBlocks?: BlogSettingsBlock[] | null
  archiveLayout?: string | null
  postsPerPage?: number | null
  showAuthor?: boolean | null
  showDate?: boolean | null
  showCategories?: boolean | null
  updatedAt: string
  createdAt: string
}

const ops = createGlobalOps(blogSettings, BlogSettings, {}, {
  relsTable: { table: blogSettingsRels, targetColumns: blogSettingsRelsTargetColumns },
  blocksFields: { introBlocks: { blockTypes: blogSettingsBlockTypes } },
})

export const findBlogSettings = ops.find as unknown as () => Promise<BlogSettingsDoc | null>
export const updateBlogSettings = ops.update as unknown as (
  data: Partial<Omit<BlogSettingsDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<BlogSettingsDoc>
