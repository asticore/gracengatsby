import { ReviewEvents } from '@/features/approval/collection'

import { createCollectionOps } from '../generic'
import { reviewEvents } from '../schema/reviewEvents'

/** The document shape of the `review-events` collection - see src/features/approval/collection.ts. */
export type ReviewEventDoc = {
  id: number
  collection: string
  docId: number
  docTitle?: string | null
  action: 'submitted' | 'approved' | 'changes_requested' | 'comment' | 'published' | 'withdrawn'
  note?: string | null
  actor?: number | null
  actorName?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(reviewEvents, ReviewEvents)

export const findReviewEvents = ops.findMany as unknown as (args?: { where?: import('@/engine').Where; limit?: number }) => Promise<ReviewEventDoc[]>
/** The adapter-shaped counterpart to findReviewEvents - see ../generic.ts's findPaginated doc comment. */
export const findReviewEventsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findReviewEventByID = ops.findByID as unknown as (id: number) => Promise<ReviewEventDoc | null>
export const countReviewEvents = ops.count
export const createReviewEvent = ops.create as unknown as (
  data: Partial<Omit<ReviewEventDoc, 'id' | 'updatedAt' | 'createdAt'>> & { collection: string; docId: number; action: ReviewEventDoc['action'] },
) => Promise<ReviewEventDoc>
export const updateReviewEvent = ops.updateByID as unknown as (id: number, data: Partial<Omit<ReviewEventDoc, 'id' | 'updatedAt' | 'createdAt'>>) => Promise<ReviewEventDoc | null>
export const deleteReviewEvent = ops.deleteByID