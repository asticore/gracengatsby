import type { Where } from '@/engine'

import { Lessons } from '@/features/courses/collections/Lessons'

import { createCollectionOps } from '../generic'
import { lessons, lessonsContentBlockTypes, lessonsRels, lessonsRelsTargetColumns, lessonsResources } from '../schema'

/** One block instance inside a lesson's `content` field - see src/blocks/*.ts and cms/db/collections/pageTemplates.ts's PageTemplateBlock for the shared shape this mirrors. */
export type LessonBlock = {
  id: string
  blockType: string
  blockName?: string | null
} & Record<string, unknown>

/** Payload's document shape for the `lessons` collection - see src/features/courses/collections/Lessons.ts. Lessons has no `versions` config, so (unlike Courses) there is no version-row shape to model here. */
export type LessonDoc = {
  id: number
  title: string
  course: number
  order: number
  slug?: string | null
  isPreview?: boolean | null
  videoUrl?: string | null
  durationMinutes?: number | null
  content?: LessonBlock[] | null
  resources?: { id: string; label?: string | null; file?: number | null }[] | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(lessons, Lessons, { resources: lessonsResources }, {
  relsTable: { table: lessonsRels, targetColumns: lessonsRelsTargetColumns },
  blocksFields: { content: { blockTypes: lessonsContentBlockTypes } },
})

export const findLessons = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<LessonDoc[]>
export const findLessonByID = ops.findByID as unknown as (id: number) => Promise<LessonDoc | null>
export const countLessons = ops.count
export const createLesson = ops.create as unknown as (
  data: Partial<Omit<LessonDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; course: number; order: number },
) => Promise<LessonDoc>
export const updateLesson = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<LessonDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<LessonDoc | null>
export const deleteLesson = ops.deleteByID
