import type { CollectionConfig } from 'payload'

import { formatSlugHook } from '@/utilities/formatSlug'

import { isMembersAdmin } from '../access'
import { MEMBERSHIP_TIERS_SLUG, MEMBERSHIP_TIERS_TABLE } from '../slugs'

/**
 * One level of membership - what it costs, how often it bills, and what it
 * unlocks.
 *
 * `rank` rather than a list of documents each tier can see. Gating by rank
 * means a new page is protected by choosing a number, and a tier added later
 * inherits everything below it without anybody editing old content. The
 * alternative - each tier listing its pages - rots the moment somebody adds a
 * page and forgets to add it to three tiers.
 *
 * Read is open because the pricing page needs it; `active: false` is what takes
 * a tier off sale, and the storefront filters on it. Nothing secret lives here.
 */
export const MembershipTiers: CollectionConfig = {
  slug: MEMBERSHIP_TIERS_SLUG,
  dbName: MEMBERSHIP_TIERS_TABLE,
  labels: { singular: 'Membership Tier', plural: 'Membership Tiers' },
  admin: {
    useAsTitle: 'name',
    group: 'Members',
    defaultColumns: ['name', 'rank', 'price', 'interval', 'active'],
    description: 'The levels people can join at, what each costs, and what each unlocks.',
  },
  access: {
    create: isMembersAdmin,
    read: () => true,
    update: isMembersAdmin,
    delete: isMembersAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, admin: { width: '60%' } },
        {
          name: 'active',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            width: '40%',
            description: 'Uncheck to take this tier off sale. Existing members keep their access.',
          },
        },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the name. This is what the default-tier setting refers to.',
      },
      hooks: { beforeValidate: [formatSlugHook('name')] },
    },
    {
      name: 'rank',
      type: 'number',
      defaultValue: 1,
      required: true,
      index: true,
      admin: {
        position: 'sidebar',
        description:
          'Higher unlocks more. A member on rank 3 can open anything locked to rank 3 or below, so leave gaps (10, 20, 30) if you may add a tier between two later.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'price',
          type: 'number',
          min: 0,
          defaultValue: 0,
          admin: {
            width: '33%',
            description: 'In whole currency - the currency itself is set under Settings > Members.',
          },
        },
        {
          name: 'interval',
          type: 'select',
          defaultValue: 'monthly',
          admin: { width: '33%', description: 'How often the member is charged.' },
          options: [
            { label: 'One-off payment', value: 'one-time' },
            { label: 'Monthly', value: 'monthly' },
            { label: 'Every 3 months', value: 'quarterly' },
            { label: 'Yearly', value: 'yearly' },
          ],
        },
        {
          name: 'trialDays',
          type: 'number',
          min: 0,
          defaultValue: 0,
          admin: { width: '33%', description: 'Free days before the first charge. 0 for no trial.' },
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'The one-line pitch shown on the join page.' },
    },
    {
      name: 'benefits',
      type: 'array',
      labels: { singular: 'Benefit', plural: 'Benefits' },
      admin: { description: 'The bullet list under this tier on the join page.', initCollapsed: true },
      fields: [{ name: 'benefit', type: 'text' }],
    },
    {
      name: 'stripePriceId',
      type: 'text',
      admin: {
        position: 'sidebar',
        description:
          'The recurring price ID from Stripe (starts with price_). Paid tiers cannot be subscribed to without it - create the price in Stripe and paste it here.',
      },
    },
  ],
  versions: false,
}
