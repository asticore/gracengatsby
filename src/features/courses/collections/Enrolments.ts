import type { Access, CollectionConfig } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'

import { isAdminUser } from '../entitlement'
import { COURSES_SLUG, ENROLMENTS_SLUG } from '../types'

/** An admin, or the learner asking about their own seat. */
const adminOrOwn: Access = ({ req }) => {
  if (isAdminUser(req.user)) return true
  if (!req.user) return false
  return { user: { equals: req.user.id } }
}

/**
 * A seat on a course.
 *
 * An enrolment is a grant, so nobody may write their own: `create` and `update`
 * are admin-only and the feature's own code writes rows with access overridden,
 * but only after `entitlementFor` has said yes. Left open, a learner could POST
 * themselves onto a paid course and the paywall would be a suggestion.
 *
 * Enrolments are not the only route in - a free course needs none, and a
 * purchase is honoured from the order itself - so a missing row never locks
 * out someone who has genuinely paid.
 */
export const Enrolments: CollectionConfig = {
  slug: ENROLMENTS_SLUG,
  dbName: 'eg_enrolments',
  labels: { singular: 'Enrolment', plural: 'Enrolments' },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['user', 'course', 'status', 'enrolledAt'],
    group: 'Courses',
    description: 'Who is on which course. Add a row here to hand someone a seat without a purchase.',
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
      name: 'course',
      type: 'relationship',
      relationTo: COURSES_SLUG,
      required: true,
      index: true,
    },
    {
      name: 'enrolledAt',
      type: 'date',
      index: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      index: true,
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Completed', value: 'completed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Added by an admin', value: 'manual' },
        { label: 'Bought through the shop', value: 'purchase' },
        { label: 'Membership tier', value: 'tier' },
      ],
      admin: { description: 'How the seat was granted. Recorded for reporting; access is re-checked live.' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Stamped rather than defaulted so a row created by the purchase path
        // carries a real time even when nothing filled the field in.
        if (operation === 'create' && !data.enrolledAt) data.enrolledAt = new Date().toISOString()
        return data
      },
    ],
  },
}
