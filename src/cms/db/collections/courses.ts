import type { Where } from '@/engine'

import { Courses } from '@/features/courses/collections/Courses'

import { createCollectionOps, createDraftOps, createVersionsOps } from '../generic'
import { courses, coursesGenerated, coursesJoinFields, coursesVersions } from '../schema'

/**
 * Payload's document shape for the `courses` collection - see
 * src/features/courses/collections/Courses.ts. `lessons` is a `join` field,
 * resolved read-only at query time - see ../generic.ts's createJoinOps doc
 * comment for the confirmed `{ docs, hasNextPage }` shape.
 */
export type CourseDoc = {
  id: number
  title: string
  slug?: string | null
  description?: string | null
  coverImage?: number | null
  accessType: string
  product?: number | null
  tierSlug?: string | null
  seo?: { metaTitle?: string | null; metaDescription?: string | null; ogImage?: number | null; noIndex?: boolean | null }
  lessons?: { docs: number[]; hasNextPage: boolean }
  _status?: string | null
  updatedAt: string
  createdAt: string
}

/** One saved version of a Courses document - top-level scalar/group fields only, same shape Events' EventVersion proved (Courses has no blocks/array field to version). */
export type CourseVersion = {
  id: number
  parentId: number | null
  latest: boolean | null
  createdAt: string
  updatedAt: string
  versionUpdatedAt: string | null
  versionCreatedAt: string | null
  _status?: string | null
} & Omit<CourseDoc, 'id' | 'updatedAt' | 'createdAt' | '_status'>

const baseOps = createCollectionOps(courses, Courses, {}, { groupFields: coursesGenerated.groupFields, joinFields: coursesJoinFields })
const versionsOps = createVersionsOps(coursesVersions, coursesGenerated.groupFields)
// Courses has drafts enabled (versions.drafts: true) - same policy as
// Events/Pages/Posts, see ../generic.ts's createDraftOps doc comment and
// tests/int/cms-db-courses-drafts.int.spec.ts for the parity proof.
// `lessons` is omitted from what gets snapshotted into a version row - it's
// a join field, never a real column on either table (same as Events' rsvps).
const ops = createDraftOps(baseOps, versionsOps, { omit: ['lessons'] })

export const findCourses = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<CourseDoc[]>
export const findCourseByID = ops.findByID as unknown as (id: number, opts?: { draft?: boolean }) => Promise<CourseDoc | null>
export const countCourses = ops.count
export const createCourse = ops.create as unknown as (
  data: Partial<Omit<CourseDoc, 'id' | 'updatedAt' | 'createdAt'>> & { title: string; accessType: string },
) => Promise<CourseDoc>
export const updateCourse = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<CourseDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { draft?: boolean },
) => Promise<CourseDoc | null>
export const deleteCourse = ops.deleteByID

export const findLatestCourseVersion = versionsOps.findLatestByParentID as unknown as (parentId: number) => Promise<CourseVersion | null>
export const findCourseVersions = versionsOps.findAllByParentID as unknown as (parentId: number) => Promise<CourseVersion[]>
export const createCourseVersion = versionsOps.createVersion as unknown as (
  parentId: number,
  data: Partial<Omit<CourseDoc, 'id' | 'updatedAt' | 'createdAt'>>,
  opts?: { latest?: boolean },
) => Promise<CourseVersion>
