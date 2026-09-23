import type { Sort, Where } from '@/engine'

import { Products } from '@/features/ecommerce/collections/Products'

import { createCollectionOps, createDraftOps, createVersionsOps } from '../generic'
import {
  products,
  productsBlockTypes,
  productsGenerated,
  productsRels,
  productsRelsTargetColumns,
  productsVersions,
  productsVersionsBlockTypes,
  productsVersionsRels,
  productsVersionsRelsTargetColumns,
} from '../schema'

/** One block instance in `layout` - see ./pages.ts's PageBlock doc comment, same idea (`layout` reuses the identical pageBuilderBlocks library). */
export type ProductBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/**
 * Payload's document shape for the `products` collection - see
 * src/features/ecommerce/collections/Products.ts. `deletedAt` is modeled as
 * a plain passthrough column only (not full Payload `trash` CRUD policy -
 * soft-delete-on-delete, default-exclude-trashed-on-find - which this Layer
 * 1 stage deliberately does not implement yet, same as Carts' `status`; see
 * this collection's own header comment). `deleteProduct` below is a genuine
 * hard delete, same as every other collection's `deleteByID` today.
 */
export type ProductDoc = {
  id: number
  title: string
  slug?: string | null
  category?: string | null
  shortDescription?: string | null
  description?: unknown
  images?: number[] | null
  faqs?: number[] | null
  layout?: ProductBlock[] | null
  seo?: { metaTitle?: string | null; metaDescription?: string | null; ogImage?: number | null; noIndex?: boolean | null }
  customFields?: unknown
  inventory?: number | null
  priceInAUDEnabled?: boolean | null
  priceInAUD?: number | null
  _status?: string | null
  deletedAt?: string | null
  updatedAt: string
  createdAt: string
}

/** One saved version of a Products document - see ./pages.ts's PageVersion doc comment, same idea. */
export type ProductVersion = {
  id: number
  parentId: number | null
  latest: boolean | null
  createdAt: string
  updatedAt: string
  versionUpdatedAt: string | null
  versionCreatedAt: string | null
  _status?: string | null
} & Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt' | '_status'>

// `images` (upload, hasMany) and `faqs` (relationship, hasMany) are both
// TOP-LEVEL fields (not nested in `layout`'s blocks) - this app's first
// drafts-enabled collection with one, so both the live AND versioned side
// need `topLevelRelsFieldTargets` (see generic.ts's createVersionsOps doc
// comment for the versioned-side gap this closed).
const baseOps = createCollectionOps(products, Products, {}, {
  relsTable: { table: productsRels, targetColumns: productsRelsTargetColumns },
  topLevelRelsFieldTargets: { images: 'media', faqs: 'faqs' },
  blocksFields: { layout: { blockTypes: productsBlockTypes } },
  groupFields: productsGenerated.groupFields,
})

const versionsOps = createVersionsOps(productsVersions, productsGenerated.groupFields, {
  relsTable: { table: productsVersionsRels, targetColumns: productsVersionsRelsTargetColumns },
  topLevelRelsFieldTargets: { images: 'media', faqs: 'faqs' },
  blocksFields: { layout: { blockTypes: productsVersionsBlockTypes } },
})

// Products has drafts enabled (versions.drafts: true), same policy as
// Events/Pages - see generic.ts's createDraftOps doc comment.
const ops = createDraftOps(baseOps, versionsOps)

export const findProducts = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<ProductDoc[]>
export const findProductByID = ops.findByID as unknown as (id: number, opts?: { draft?: boolean }) => Promise<ProductDoc | null>
export const countProducts = ops.count
export const createProduct = ops.create as unknown as (
  data: Partial<Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string },
) => Promise<ProductDoc>
export const updateProduct = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { draft?: boolean },
) => Promise<ProductDoc | null>
export const deleteProduct = ops.deleteByID

export const findLatestProductVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<ProductVersion | null>
export const findProductVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<ProductVersion[]>
export const createProductVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<ProductVersion>

// Plain baseOps exports for engageD1Adapter's dispatch - same double-write
// landmine and fix as events.ts's/pages.ts's own comment above their
// equivalent blocks (see those, confirmed against
// payload/dist/collections/operations/create.js:194-221).
export const findProductsPaginated = baseOps.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof baseOps.findPaginated>
export const createProductLiveRow = baseOps.create as unknown as (
  data: Partial<Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string },
) => Promise<ProductDoc>
export const updateProductLiveRow = baseOps.updateByID as unknown as (
  id: number,
  data: Partial<Omit<ProductDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<ProductDoc | null>
