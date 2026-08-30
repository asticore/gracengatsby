import type { FeatureKey } from '@/features/registry'

/** Registry key this whole feature hangs off. Nothing here runs while it is off. */
export const LMS_FEATURE_KEY: FeatureKey = 'lms'

export const COURSES_SLUG = 'courses'
export const LESSONS_SLUG = 'lessons'
export const ENROLMENTS_SLUG = 'enrolments'
export const LESSON_PROGRESS_SLUG = 'lesson-progress'

/**
 * Collection slug owned by the members feature, which is built in parallel.
 * Referenced by name only - importing it would couple two features that must
 * be able to ship, and be switched off, independently.
 */
export const MEMBERSHIPS_SLUG = 'memberships'

/** How a learner earns the right to open a course's lessons. */
export type CourseAccessType = 'free' | 'purchase' | 'tier'

export type EnrolmentStatus = 'active' | 'completed' | 'cancelled'

/**
 * Why a learner may or may not open a course, rather than a bare boolean.
 *
 * The course page needs the reason to say something useful - "buy this" is a
 * different screen from "upgrade your membership" and from "sign in" - and the
 * lesson guard needs it to choose between 404 and a redirect.
 */
export type EntitlementReason =
  | 'admin'
  | 'free'
  | 'enrolled'
  | 'purchased'
  | 'tier'
  | 'anonymous'
  | 'payment-required'
  | 'tier-required'
  | 'tier-unavailable'

export type Entitlement = {
  granted: boolean
  reason: EntitlementReason
}

export type CourseProgress = {
  totalLessons: number
  completedLessons: number
  /** 0-100, rounded to a whole number. 0 when the course has no lessons yet. */
  percent: number
  /** Lesson ids the learner has ticked off, for rendering the curriculum. */
  completedLessonIds: number[]
}
