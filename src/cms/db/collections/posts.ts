import type { Where } from '@/engine'

import { Posts } from '@/collections/Posts'

import { createCollectionOps, createDraftOps, createVersionsOps } from '../generic'
import {
  postsBlockTypes,
  postsCategories,
  postsGenerated,
  posts,
  postsRels,
  postsRelsTargetColumns,
  postsVersionsBlockTypes,
  postsVersionsCategories,
  postsVersions,
  postsVersionsRels,
  postsVersionsRelsTargetColumns,
} from '../schema'

/** One category array-row as Payload's own API returns it. */
export type PostCategory = { id: string; name?: string | null }

/** One block instance as Payload's own API returns it - see ./pageTemplates.ts's PageTemplateBlock doc comment, same idea. */
export type PostBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `posts` collection - see src/collections/Posts.ts. */
export type PostDoc = {
  id: number
  title: string
  slug?: string | null
  publishedDate?: string | null
  author?: number | null
  categories?: PostCategory[] | null
  featuredImage?: number | null
  excerpt?: string | null
  content: unknown
  layout?: PostBlock[] | null
  seo?: { metaTitle?: string | null; metaDescription?: string | null; ogImage?: number | null; noIndex?: boolean | null }
  customFields?: unknown
  membersOnly?: { enabled?: boolean | null; tier?: number | null }
  _status?: string | null
  updatedAt: string
  createdAt: string
}

/**
 * One saved version of a Posts document - the first proof target with a
 * versioned ARRAY field (`categories`) on top of versioned blocks/rels
 * (already proven against Pages). A version category row's `id` is that
 * row's `_uuid` column, not its internal autoincrement integer id - kept as
 * `id` here so callers see the same shape as a live PostCategory, matching
 * ../schema/generate.ts's generateArrayTable `versioned` param doc comment.
 */
export type PostVersion = {
  id: number
  parentId: number | null
  latest: boolean | null
  createdAt: string
  updatedAt: string
  versionUpdatedAt: string | null
  versionCreatedAt: string | null
  _status?: string | null
} & Omit<PostDoc, 'id' | 'updatedAt' | 'createdAt' | '_status'>

const baseOps = createCollectionOps(
  posts,
  Posts,
  { categories: postsCategories },
  {
    relsTable: { table: postsRels, targetColumns: postsRelsTargetColumns },
    blocksFields: { layout: { blockTypes: postsBlockTypes } },
    groupFields: postsGenerated.groupFields,
  },
)

const versionsOps = createVersionsOps(postsVersions, postsGenerated.groupFields, {
  arrayTables: { categories: postsVersionsCategories },
  relsTable: { table: postsVersionsRels, targetColumns: postsVersionsRelsTargetColumns },
  blocksFields: { layout: { blockTypes: postsVersionsBlockTypes } },
})

// Posts has drafts enabled (versions.drafts: true), same policy as
// Events/Pages - see ../generic.ts's createDraftOps doc comment and
// tests/int/cms-db-posts-drafts.int.spec.ts for the parity proof. Posts has
// no join field, so nothing needs to be omitted from what gets snapshotted
// into a version row (same as Pages).
const ops = createDraftOps(baseOps, versionsOps)

export const findPosts = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<PostDoc[]>
export const findPostByID = ops.findByID as unknown as (id: number, opts?: { draft?: boolean }) => Promise<PostDoc | null>
export const countPosts = ops.count
export const createPost = ops.create as unknown as (
  data: Partial<Omit<PostDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; content: unknown },
) => Promise<PostDoc>
export const updatePost = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<PostDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { draft?: boolean },
) => Promise<PostDoc | null>
export const deletePost = ops.deleteByID

export const findLatestPostVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<PostVersion | null>
export const findPostVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<PostVersion[]>
export const createPostVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<PostDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<PostVersion>
