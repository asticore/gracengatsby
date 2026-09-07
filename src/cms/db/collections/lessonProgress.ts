import type { Where } from '@/engine'

import { LessonProgress } from '@/features/courses/collections/LessonProgress'

import { createCollectionOps } from '../generic'
import { lessonProgress } from '../schema'

/** Payload's document shape for the `lesson-progress` collection - see src/features/courses/collections/LessonProgress.ts. */
export type LessonProgressDoc = {
  id: number
  user: number
  lesson: number
  course: number
  completed?: boolean | null
  completedAt?: string | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(lessonProgress, LessonProgress)

export const findLessonProgress = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<LessonProgressDoc[]>
export const findLessonProgressByID = ops.findByID as unknown as (id: number) => Promise<LessonProgressDoc | null>
export const countLessonProgress = ops.count
export const createLessonProgress = ops.create as unknown as (
  data: Partial<Omit<LessonProgressDoc, 'id' | 'updatedAt' | 'createdAt'>> & { user: number; lesson: number; course: number },
) => Promise<LessonProgressDoc>
export const updateLessonProgress = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<LessonProgressDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LessonProgressDoc | null>
export const deleteLessonProgress = ops.deleteByID
