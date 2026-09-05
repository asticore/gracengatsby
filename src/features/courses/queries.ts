import { headers as nextHeaders } from 'next/headers'
import type { Engine, TypedUser, Where } from '@/engine'

import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import type { FeatureFlags } from '@/features/registry'

import { entitlementFor, type CourseLike } from './entitlement'
import { COURSES_SLUG, LESSONS_SLUG, type Entitlement } from './types'

type MaybeUser = TypedUser | null | undefined

/** One row of the table of contents. Titles and timings only - never a body. */
export type CurriculumEntry = {
  id: number
  title: string
  slug: string | null
  order: number
  durationMinutes: number | null
  isPreview: boolean
}

export type CourseDoc = CourseLike & {
  title: string
  slug?: string | null
  description?: string | null
  coverImage?: unknown
  seo?: unknown
}

/** The engine, the flags and the signed-in learner, resolved once per request. */
export type LearnerContext = {
  engine: Engine
  flags: FeatureFlags
  user: MaybeUser
}

export const learnerContext = async (): Promise<LearnerContext> => {
  const engine = await getEngine()
  const [flags, auth] = await Promise.all([
    getFeatureFlags(),
    engine.auth({ headers: await nextHeaders() }).catch((): { user: MaybeUser } => ({ user: null })),
  ])
  return { engine, flags, user: auth.user }
}

export const publishedCourses = async (engine: Engine): Promise<CourseDoc[]> => {
  const { docs } = await engine.find({
    collection: COURSES_SLUG as 'users',
    where: { _status: { equals: 'published' } } as Where,
    sort: 'title',
    limit: 100,
    depth: 1,
    overrideAccess: true,
  })
  return docs as unknown as CourseDoc[]
}

export const courseBySlug = async (engine: Engine, slug: string): Promise<CourseDoc | null> => {
  const { docs } = await engine.find({
    collection: COURSES_SLUG as 'users',
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] } as Where,
    limit: 1,
    depth: 1,
    overrideAccess: true,
  })
  return (docs[0] as unknown as CourseDoc) ?? null
}

/**
 * The table of contents for a course, safe to show anybody.
 *
 * Access is overridden on purpose and then narrowed by hand to the six fields
 * below. The alternative - an access-enforced query - would hide locked lessons
 * from the very outline that is meant to sell them. Nothing here can leak the
 * content: `content`, `videoUrl` and `resources` are never read.
 */
export const curriculumFor = async (engine: Engine, courseId: number): Promise<CurriculumEntry[]> => {
  const { docs } = await engine.find({
    collection: LESSONS_SLUG as 'users',
    where: { course: { equals: courseId } } as Where,
    sort: 'order',
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })

  return (docs as unknown as Record<string, unknown>[]).map((lesson) => ({
    id: lesson.id as number,
    title: (lesson.title as string) ?? 'Untitled lesson',
    slug: (lesson.slug as string | null) ?? null,
    order: (lesson.order as number) ?? 0,
    durationMinutes: (lesson.durationMinutes as number | null) ?? null,
    isPreview: Boolean(lesson.isPreview),
  }))
}

export const courseEntitlement = async (
  { engine, flags, user }: LearnerContext,
  course: CourseLike,
): Promise<Entitlement> => entitlementFor(engine, course, user, flags)

export type LessonDoc = {
  id: number
  title: string
  slug?: string | null
  videoUrl?: string | null
  durationMinutes?: number | null
  isPreview?: boolean | null
  content?: unknown[] | null
  resources?: { label?: string | null; file?: unknown }[] | null
}

/**
 * One lesson's full body, fetched with the collection's own access control in
 * force.
 *
 * `overrideAccess: false` plus the learner's user is the whole point: the same
 * `where` clause the REST API is subject to is applied here, so an unpaid
 * lesson comes back as no rows at all. The page then 404s on nothing, rather
 * than fetching a document and deciding not to draw it.
 */
export const readableLesson = async (
  { engine, user }: LearnerContext,
  courseId: number,
  slug: string,
): Promise<LessonDoc | null> => {
  const { docs } = await engine.find({
    collection: LESSONS_SLUG as 'users',
    where: { and: [{ course: { equals: courseId } }, { slug: { equals: slug } }] } as Where,
    limit: 1,
    depth: 2,
    overrideAccess: false,
    user: user ?? undefined,
  })
  return (docs[0] as unknown as LessonDoc) ?? null
}

/** The lessons either side of this one, for the previous/next controls. */
export const neighbours = (
  curriculum: CurriculumEntry[],
  lessonId: number,
): { previous: CurriculumEntry | null; next: CurriculumEntry | null } => {
  const index = curriculum.findIndex((entry) => entry.id === lessonId)
  if (index === -1) return { previous: null, next: null }
  return {
    previous: curriculum[index - 1] ?? null,
    next: curriculum[index + 1] ?? null,
  }
}
