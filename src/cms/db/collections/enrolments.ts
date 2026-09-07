import type { Where } from '@/engine'

import { Enrolments } from '@/features/courses/collections/Enrolments'

import { createCollectionOps } from '../generic'
import { enrolments } from '../schema'

/** Payload's document shape for the `enrolments` collection - see src/features/courses/collections/Enrolments.ts. */
export type EnrolmentDoc = {
  id: number
  user: number
  course: number
  enrolledAt?: string | null
  status: string
  source?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(enrolments, Enrolments)

export const findEnrolments = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<EnrolmentDoc[]>
export const findEnrolmentByID = ops.findByID as unknown as (id: number) => Promise<EnrolmentDoc | null>
export const countEnrolments = ops.count
export const createEnrolment = ops.create as unknown as (
  data: Partial<Omit<EnrolmentDoc, 'id' | 'updatedAt' | 'createdAt'>> & { user: number; course: number },
) => Promise<EnrolmentDoc>
export const updateEnrolment = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<EnrolmentDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<EnrolmentDoc | null>
export const deleteEnrolment = ops.deleteByID
