import type { Sort, Where } from '@/engine'

import { LockedDocuments } from '@/collections/LockedDocuments'

import { createCollectionOps } from '../generic'
import { lockedDocuments, lockedDocumentsRels, lockedDocumentsRelsTargetColumns } from '../schema'

/**
 * The original engine's document shape for the `engine-locked-documents` collection -
 * see src/collections/LockedDocuments.ts. `document` is deliberately
 * absent - see that file's header for the confirmed, documented gap.
 */
export type LockedDocumentDoc = {
  id: number
  globalSlug?: string | null
  user?: number[] | null
  updatedAt: string
  createdAt: string
}

// Same `topLevelRelsFieldTargets` pattern as preferences.ts's `user` field -
// see that file's header.
const ops = createCollectionOps(
  lockedDocuments,
  LockedDocuments,
  {},
  {
    relsTable: { table: lockedDocumentsRels, targetColumns: lockedDocumentsRelsTargetColumns },
    topLevelRelsFieldTargets: { user: 'users' },
  },
)

export const findLockedDocuments = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<LockedDocumentDoc[]>
export const findLockedDocumentsPaginated = ops.findPaginated as unknown as (args?: {
  where?: Where
  sort?: Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findLockedDocumentByID = ops.findByID as unknown as (id: number) => Promise<LockedDocumentDoc | null>
export const countLockedDocuments = ops.count
export const createLockedDocument = ops.create as unknown as (
  data: Partial<Omit<LockedDocumentDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LockedDocumentDoc>
export const updateLockedDocument = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<LockedDocumentDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LockedDocumentDoc | null>
export const deleteLockedDocument = ops.deleteByID
