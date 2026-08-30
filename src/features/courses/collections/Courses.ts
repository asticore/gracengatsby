import type { CollectionConfig } from 'payload'

import { adminOrPublishedStatus, isAdmin } from '@/access/ecommerceAccess'
import { seoFields } from '@/fields/seo'
import { formatSlugHook } from '@/utilities/formatSlug'

import { COURSES_SLUG, LESSONS_SLUG } from '../types'

/**
 * A course: the thing a learner enrols in, and the unit that access is decided
 * on.
 *
 * A course document is deliberately public once published - the listing page,
 * the sales pitch and the curriculum outline all read from it. Nothing behind
 * the paywall lives here; the lessons carry that, and they are gated
 * separately. Keeping the split at the document level is what lets the course
 * page show a full table of contents to someone who has not paid yet without
 * leaking a single line of the content itself.
 */
export const Courses: CollectionConfig = {
  slug: COURSES_SLUG,
  dbName: 'eg_courses',
  labels: { singular: 'Course', plural: 'Courses' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'accessType', '_status'],
    group: 'Courses',
    description:
      'Each course holds an ordered set of lessons. Set how people get in - free, bought through the shop, or included with a membership tier - under Access in the sidebar.',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: adminOrPublishedStatus,
    update: isAdmin,
  },
  versions: {
    drafts: true,
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the title as you type - edit it here to override. Sets the URL: /courses/<slug>.',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: {
        beforeValidate: [formatSlugHook('title')],
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Shown on the course card and at the top of the course page.' },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'accessType',
      type: 'select',
      required: true,
      defaultValue: 'free',
      index: true,
      options: [
        { label: 'Free - anyone can read it', value: 'free' },
        { label: 'Bought through the shop', value: 'purchase' },
        { label: 'Included with a membership tier', value: 'tier' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Who may open the lessons. The curriculum is always visible; only the lesson content is gated.',
      },
    },
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      admin: {
        position: 'sidebar',
        condition: (data) => data?.accessType === 'purchase',
        description: 'The shop product that grants this course. A paid order containing it unlocks every lesson.',
      },
    },
    {
      // A plain slug rather than a relationship: membership tiers belong to the
      // Members feature, which can be switched off or absent entirely. A text
      // reference survives that, where a relationship to a missing collection
      // would stop the whole config from loading.
      name: 'tierSlug',
      type: 'text',
      label: 'Membership tier',
      admin: {
        position: 'sidebar',
        condition: (data) => data?.accessType === 'tier',
        description:
          'The slug of the membership tier that includes this course. If Members is switched off, tier-gated courses stay locked for everyone but an admin.',
      },
    },
    seoFields,
    {
      // A join, not a stored list: lesson order lives on the lesson itself, so
      // there is one place to change it and no way for the two ends to disagree.
      name: 'lessons',
      type: 'join',
      collection: LESSONS_SLUG,
      on: 'course',
      defaultSort: 'order',
      admin: {
        description: 'Lessons in this course, in order. Add lessons from the Lessons screen and set their Order there.',
      },
    },
  ],
}
