import type { CollectionConfig, CollectionSlug } from 'payload'

import { isAdminOrMembershipOwner, isMembersAdmin } from '../access'
import { MEMBERSHIPS_SLUG, MEMBERSHIPS_TABLE, MEMBERSHIP_TIERS_SLUG } from '../slugs'

// See the note in gateField.ts: the generated slug union does not contain this
// collection until it is registered in the config and types are regenerated.
const TIERS_RELATION = MEMBERSHIP_TIERS_SLUG as CollectionSlug

/**
 * One person's membership: which tier, what state it is in, and the Stripe
 * subscription behind it.
 *
 * This table is the whole basis of the gate, so every write is admin-only -
 * see access.ts. Member-initiated changes go through the feature's own server
 * functions, which write with `overrideAccess` after checking settings.
 *
 * A person can hold more than one row over time (rejoin after cancelling), so
 * there is no unique constraint on `user`. `resolveEntitlement` picks the
 * highest-ranked row that currently grants access rather than assuming one.
 *
 * Dates are stored as dates rather than derived from Stripe on every read: the
 * gate runs on page render and must not depend on a network call to a third
 * party being up.
 */
export const Memberships: CollectionConfig = {
  slug: MEMBERSHIPS_SLUG,
  dbName: MEMBERSHIPS_TABLE,
  labels: { singular: 'Membership', plural: 'Memberships' },
  admin: {
    useAsTitle: 'id',
    group: 'Members',
    defaultColumns: ['user', 'tier', 'status', 'startedAt', 'renewsAt'],
    description: 'Who is a member, at what level, and until when.',
  },
  access: {
    create: isMembersAdmin,
    read: isAdminOrMembershipOwner,
    update: isMembersAdmin,
    delete: isMembersAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'user',
          type: 'relationship',
          relationTo: 'users',
          required: true,
          index: true,
          admin: { width: '50%' },
        },
        {
          name: 'tier',
          type: 'relationship',
          relationTo: TIERS_RELATION,
          required: true,
          index: true,
          admin: { width: '50%' },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      admin: {
        description:
          'Only Active and Trialing unlock content. Past due keeps the record but locks the content, which is what you want while a card is being retried.',
      },
      options: [
        { label: 'Pending - not paid yet', value: 'pending' },
        { label: 'Trialing', value: 'trialing' },
        { label: 'Active', value: 'active' },
        { label: 'Past due', value: 'past-due' },
        { label: 'Cancelled - runs to the end of the period', value: 'cancelled' },
        { label: 'Expired', value: 'expired' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startedAt', type: 'date', admin: { width: '33%' } },
        {
          name: 'renewsAt',
          type: 'date',
          index: true,
          admin: {
            width: '33%',
            description: 'End of the paid period. The expiry reminder counts back from this.',
          },
        },
        { name: 'trialEndsAt', type: 'date', admin: { width: '33%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'cancelledAt',
          type: 'date',
          admin: { width: '50%', description: 'When the member asked to stop, not when access ends.' },
        },
        {
          name: 'cancelAtPeriodEnd',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            width: '50%',
            description: 'Set when a cancellation is scheduled but the paid period has not run out yet.',
          },
        },
      ],
    },
    {
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [
        {
          name: 'externalSubscriptionId',
          type: 'text',
          index: true,
          admin: {
            description: 'The Stripe subscription ID (sub_...). Incoming webhooks are matched on this.',
          },
        },
        {
          name: 'externalCustomerId',
          type: 'text',
          admin: { description: 'The Stripe customer ID (cus_...).' },
        },
      ],
    },
    // Written by the mailer, read by it too - they are how a resend is
    // prevented after a retry or a second webhook for the same event.
    {
      type: 'row',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'welcomeEmailSentAt', type: 'date', admin: { readOnly: true } },
        { name: 'expiryReminderSentAt', type: 'date', admin: { readOnly: true } },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: { description: 'Internal only - never shown to the member.' },
    },
  ],
  versions: false,
}
