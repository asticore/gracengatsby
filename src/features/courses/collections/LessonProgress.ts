import type { Access, CollectionConfig } from 'payload'

import { isAdmin } from '@/access/ecommerceAccess'

import { isAdminUser } from '../entitlement'
import { COURSES_SLUG, LESSONS_SLUG, LESSON_PROGRESS_SLUG } from '../types'

/** An admin, or the learner asking about their own ticks. */
const adminOrOwn: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  if (!req.user) return false
  return { user: { equals: req.user.id } }
}

/**
 * One learner's tick against one lesson.
 *
 * A row per (user, lesson) rather than a completed-lessons list on the
 * enrolment: ticks are written one at a time by one person, and a list column
 * would make every mark-complete a read-modify-write race against the learner's
 * other open tab.
 *
 * `course` is denormalised from the lesson so the per-course percentage is one
 * counting query. Without it, working out how far through a course someone is
 * would mean fetching that course's lesson ids first and passing them back in.
 *
 * Writes go through `markLessonComplete`, which checks entitlement first - so
 * `create` and `update` are closed here, exactly as they are on enrolments.
 */
export const LessonProgress: CollectionConfig = {
  slug: LESSON_PROGRESS_SLUG,
  dbName: 'eg_lesson_progress',
  labels: { singular: 'Lesson Progress', plural: 'Lesson Progress' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['user', 'lesson', 'completed', 'completedAt'],
    group: 'Courses',
    description: 'What each learner has ticked off. Written by the lesson page; edit here only to correct a record.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: adminOrOwn,
    update: isAdmin,
  },
  fields: [
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'lesson',
      type: 'relationship',
      relationTo: LESSONS_SLUG,
      required: true,
      index: true,
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: COURSES_SLUG,
      required: true,
      index: true,
    },
    {
      name: 'completed',
      type: 'checkbox',
      defaultValue: true,
      index: true,
    },
    {
      name: 'completedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
