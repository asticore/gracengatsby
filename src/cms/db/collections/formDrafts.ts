import { FormDrafts } from '@/features/forms/collections/FormDrafts'

import { createCollectionOps } from '../generic'
import { formDrafts } from '../schema/formDrafts'

/** The document shape of the `form-drafts` collection - see src/features/forms/collections/FormDrafts.ts. */
export type FormDraftDoc = {
  id: number
  form: number
  tokenHash: string
  email: string
  dataJson: string
  page: number
  expiresAt: string
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(formDrafts, FormDrafts)
export const findFormDraftsPaginated = ops.findPaginated as unknown as (args?: {
  where?: import('@/engine').Where
  sort?: import('@/engine').Sort
  limit?: number
  page?: number
  pagination?: boolean
}) => ReturnType<typeof ops.findPaginated>
export const findFormDraftByID = ops.findByID as unknown as (id: number) => Promise<FormDraftDoc | null>
export const countFormDrafts = ops.count
export const createFormDraft = ops.create as unknown as (data: Record<string, unknown>) => Promise<FormDraftDoc>
export const updateFormDraft = ops.updateByID as unknown as (id: number, data: Record<string, unknown>) => Promise<FormDraftDoc | null>
export const deleteFormDraft = ops.deleteByID
