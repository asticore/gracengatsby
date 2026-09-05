import type { Payload, TypedUser, Where } from '@/engine'

import type { FeatureFlags } from '@/features/registry'

import { entitlementFor, type CourseLike } from './entitlement'
import { COURSES_SLUG, LESSONS_SLUG, LESSON_PROGRESS_SLUG, type CourseProgress } from './types'

type MaybeUser = TypedUser | null | undefined

export const EMPTY_PROGRESS: CourseProgress = {
  totalLessons: 0,
  completedLessons: 0,
  percent: 0,
  completedLessonIds: [],
}

/**
 * How far through a course a learner is.
 *
 * Derived on read rather than stored on the enrolment: a cached percentage
 * goes stale the moment a lesson is added or removed, and there is no event
 * that would tell every enrolment to recount. Counting is two small indexed
 * queries, which is cheaper than being wrong.
 *
 * Progress rows are kept for lessons the learner has since lost access to, and
 * are counted against the current lesson list only - so removing a lesson
 * lowers the denominator without stranding anyone above 100%.
 */
export const progressForCourse = async (
  engine: Payload,
  user: MaybeUser,
  courseId: number,
): Promise<CourseProgress> => {
  const { docs: lessons } = await engine.find({
    collection: LESSONS_SLUG as 'users',
    where: { course: { equals: courseId } } as Where,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const lessonIds = (lessons as unknown as { id: number }[]).map((lesson) => lesson.id)
  const totalLessons = lessonIds.length
  if (!user || totalLessons === 0) return { ...EMPTY_PROGRESS, totalLessons }

  const { docs: ticks } = await engine.find({
    collection: LESSON_PROGRESS_SLUG as 'users',
    where: {
      and: [
        { user: { equals: user.id } },
        { course: { equals: courseId } },
        { completed: { equals: true } },
      ],
    } as Where,
    limit: 1000,
    depth: 0,
    overrideAccess: true,
  })

  const known = new Set(lessonIds)
  const completedLessonIds = [
    ...new Set(
      (ticks as unknown as { lesson?: number | { id: number } }[])
        .map((tick) => (typeof tick.lesson === 'number' ? tick.lesson : (tick.lesson?.id ?? null)))
        .filter((id): id is number => id !== null && known.has(id)),
    ),
  ]

  const completedLessons = completedLessonIds.length
  return {
    totalLessons,
    completedLessons,
    percent: Math.round((completedLessons / totalLessons) * 100),
    completedLessonIds,
  }
}

export type MarkOutcome = { ok: true; progress: CourseProgress } | { ok: false; error: string }

/**
 * Tick, or un-tick, one lesson for one learner.
 *
 * Entitlement is re-checked here rather than trusted from the page that called
 * it. The page's check decided what to render several seconds ago; this one
 * decides what to write, and a request can arrive without ever having rendered
 * anything.
 */
export const markLessonComplete = async (
  engine: Payload,
  user: MaybeUser,
  flags: FeatureFlags,
  lessonId: number,
  completed: boolean,
): Promise<MarkOutcome> => {
  if (!flags.lms) return { ok: false, error: 'Courses are not enabled.' }
  if (!user) return { ok: false, error: 'Sign in to track your progress.' }

  const lesson = (await engine
    .findByID({ collection: LESSONS_SLUG as 'users', id: lessonId, depth: 0, overrideAccess: true })
    .catch((): null => null)) as unknown as { id: number; course?: number | { id: number } } | null
  if (!lesson) return { ok: false, error: 'That lesson no longer exists.' }

  const courseId = typeof lesson.course === 'number' ? lesson.course : (lesson.course?.id ?? null)
  if (courseId === null) return { ok: false, error: 'That lesson is not attached to a course.' }

  const course = (await engine
    .findByID({ collection: COURSES_SLUG as 'users', id: courseId, depth: 0, overrideAccess: true })
    .catch((): null => null)) as unknown as CourseLike | null
  if (!course) return { ok: false, error: 'That course no longer exists.' }

  const verdict = await entitlementFor(engine, course, user, flags)
  if (!verdict.granted) return { ok: false, error: 'You do not have access to this lesson.' }

  const { docs: existing } = await engine.find({
    collection: LESSON_PROGRESS_SLUG as 'users',
    where: { and: [{ user: { equals: user.id } }, { lesson: { equals: lessonId } }] } as Where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const data = {
    user: user.id,
    lesson: lessonId,
    course: courseId,
    completed,
    completedAt: completed ? new Date().toISOString() : null,
  }

  if (existing[0]) {
    await engine.update({
      collection: LESSON_PROGRESS_SLUG as 'users',
      id: existing[0].id,
      data: data as never,
      overrideAccess: true,
    })
  } else {
    await engine.create({
      collection: LESSON_PROGRESS_SLUG as 'users',
      data: data as never,
      overrideAccess: true,
    })
  }

  return { ok: true, progress: await progressForCourse(engine, user, courseId) }
}
