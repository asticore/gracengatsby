import type { Where } from '@/engine'

import { FormSubmissions } from '@/features/forms/collections/FormSubmissions'

import { createCollectionOps } from '../generic'
import { formSubmissions } from '../schema'

/** Payload's document shape for the `form-submissions` collection - see src/features/forms/collections/FormSubmissions.ts. */
export type FormSubmissionDoc = {
  id: number
  form?: number | null
  summary?: string | null
  values: unknown
  submittedAt?: string | null
  ip?: string | null
  userAgent?: string | null
  total?: number | null
  currency?: string | null
  paymentStatus?: string | null
  lineItems?: unknown
  notificationStatus?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(formSubmissions, FormSubmissions)

export const findFormSubmissions = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<FormSubmissionDoc[]>
export const findFormSubmissionByID = ops.findByID as unknown as (id: number) => Promise<FormSubmissionDoc | null>
export const countFormSubmissions = ops.count
export const createFormSubmission = ops.create as unknown as (
  data: Partial<Omit<FormSubmissionDoc, 'id' | 'updatedAt' | 'createdAt'>> & { values: unknown },
) => Promise<FormSubmissionDoc>
export const updateFormSubmission = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<FormSubmissionDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<FormSubmissionDoc | null>
export const deleteFormSubmission = ops.deleteByID
