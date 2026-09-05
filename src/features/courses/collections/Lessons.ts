import type { Access, CollectionConfig, Where } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'
import { pageBuilderBlocks } from '@/blocks'
import { formatSlugHook } from '@/utilities/formatSlug'
import { accessibleCourseIds, isAdminUser } from '../entitlement'
import { flagsFrom } from '../settings'
import { COURSES_SLUG, LESSONS_SLUG } from '../types'

/**
 * The gate, and the only one that matters.
 *
 * Hiding a locked lesson in the UI is decoration - the REST API, the GraphQL
 * API and any `find` that forgets to override access all come through here
 * instead. The rule is expressed as a `where` clause rather than a boolean so
 * the database never returns the row in the first place: an unpaid lesson is
 * not fetchable, not merely unrendered.
 *
 * Preview lessons are the one deliberate hole, and they are opt-in per lesson -
 * that is the free sample a course needs to sell itself.
 *
 * The course page's table of contents does not come through here: it is read
 * with access overridden and narrowed to titles and durations by
 * `curriculumFor`, so a locked lesson can be listed without its body ever
 * being loaded.
 */
const readableLessons: Access = async ({ req }) => {
  if (isAdminUser(req.user)) return true

  const flags = await flagsFrom(req.payload)
  // With the feature off the content should behave as though it were never
  // published, rather than as though it were merely hidden.
  if (!flags.lms) return false

  const courseIds = await accessibleCourseIds(req.payload, req.user, flags)

  const clause: Where = {
    or: [
      { isPreview: { equals: true } },
      ...(courseIds.length > 0 ? [{ course: { in: courseIds } }] : []),
    ],
  }
  return clause
}

export const Lessons: CollectionConfig = {
  slug: LESSONS_SLUG,
  dbName: 'eg_lessons',
  labels: { singular: 'Lesson', plural: 'Lessons' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'course', 'order', 'isPreview'],
    group: 'Courses',
    description:
      'One lesson inside a course. Build the body from the same section library as a page, so the visual editor works here too.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: readableLessons,
    update: isAdmin,
  },
  defaultSort: 'order',
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'course',
      type: 'relationship',
      relationTo: COURSES_SLUG,
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'order',
      type: 'number',
      required: true,
      defaultValue: 0,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Lowest first. Ties fall back to the order lessons were created in.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the title. Unique within its course: /courses/<course>/<slug>.',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: {
        beforeValidate: [formatSlugHook('title')],
      },
    },
    {
      name: 'isPreview',
      type: 'checkbox',
      label: 'Free preview',
      defaultValue: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Readable by anyone, even on a paid course. Use it for a sample lesson.',
      },
    },
    {
      name: 'videoUrl',
      type: 'text',
      label: 'Video URL',
      admin: { description: 'Optional. Embedded above the lesson body.' },
    },
    {
      name: 'durationMinutes',
      type: 'number',
      label: 'Duration (minutes)',
      admin: { description: 'Optional. Shown in the curriculum so learners can plan.' },
    },
    {
      name: 'content',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
    {
      name: 'resources',
      type: 'array',
      label: 'Downloadable resources',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'file', type: 'upload', relationTo: 'media', required: true },
      ],
      admin: { description: 'Worksheets, slides, anything the learner takes away.' },
    },
  ],
}
