/**
 * Public surface of the Courses feature.
 *
 * Everything outside this folder imports from here - the config takes the four
 * collections, the routes take the three screens - so the internal layout can
 * change without touching an integration point.
 *
 * The `lms` flag is honoured in exactly three places: the Lessons collection's
 * read access (which returns nothing at all while it is off), and each of the
 * three screens (which 404). The collections stay registered either way, so
 * switching the feature off hides the screens without touching a stored row,
 * and switching it back on restores every enrolment and every tick exactly as
 * they were.
 */

export { Courses } from './collections/Courses'
export { Lessons } from './collections/Lessons'
export { Enrolments } from './collections/Enrolments'
export { LessonProgress } from './collections/LessonProgress'

export { CourseListScreen } from './components/CourseListScreen'
export { CourseScreen } from './components/CourseScreen'
export { LessonScreen } from './components/LessonScreen'

export {
  accessibleCourseIds,
  entitlementFor,
  heldTierSlugs,
  isAdminUser,
  type CourseLike,
} from './entitlement'

export { EMPTY_PROGRESS, markLessonComplete, progressForCourse, type MarkOutcome } from './progress'

export {
  courseBySlug,
  courseEntitlement,
  curriculumFor,
  learnerContext,
  neighbours,
  publishedCourses,
  readableLesson,
  type CourseDoc,
  type CurriculumEntry,
  type LearnerContext,
  type LessonDoc,
} from './queries'

export { flagsFrom } from './settings'

export {
  COURSES_SLUG,
  ENROLMENTS_SLUG,
  LESSONS_SLUG,
  LESSON_PROGRESS_SLUG,
  LMS_FEATURE_KEY,
  MEMBERSHIPS_SLUG,
  type CourseAccessType,
  type CourseProgress,
  type Entitlement,
  type EntitlementReason,
  type EnrolmentStatus,
} from './types'
