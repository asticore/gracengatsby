import type { CollectionConfig } from '@/engine'

import { isAdmin, roleAccess } from '@/access/ecommerceAccess'

import { exportEndpoint } from '../exportEndpoint'
import { FORMS_SLUG } from '../slugs'

/**
 * One filled-in form.
 *
 * The answers live in a single JSON column rather than as real fields, because
 * the shape of an entry is whatever the form said it was on the day it was
 * submitted. Storing them relationally would mean a schema per form; storing
 * them as JSON means an entry taken before a field was renamed still reads
 * back exactly as it was sent. The CSV export re-attaches the labels from the
 * form definition.
 *
 * `create` is closed to the public even though the public submits entries: the
 * submission endpoint on the Forms collection writes them with `overrideAccess`,
 * after running the spam filters, conditional logic and pricing. Leaving
 * `create` open would let anyone POST straight past all of that - including
 * posting their own price on a purchasable form.
 */
export const FormSubmissions: CollectionConfig = {
  slug: 'form-submissions',
  dbName: 'eg_form_submissions',
  labels: { singular: 'Form Submission', plural: 'Form Submissions' },
  admin: {
    useAsTitle: 'summary',
    group: 'Content',
    defaultColumns: ['summary', 'form', 'status', 'assignee', 'createdAt'],
    description:
      'Entries people have sent through your forms. Download them as a spreadsheet from /api/form-submissions/export?form=<id>.',
  },
  access: {
    create: () => false,
    delete: isAdmin,
    read: roleAccess('form-submissions', 'read'),
    update: roleAccess('form-submissions', 'update'),
  },
  endpoints: [exportEndpoint],
  hooks: {
    // An entry's attachments live in R2 and must go with it (also when retention deletes it).
    afterDelete: [
      async ({ doc }: { doc?: { values?: unknown } }) => {
        const { deleteEntryFiles } = await import('../maintenance')
        await deleteEntryFiles(doc?.values)
      },
    ],
  },
  fields: [
    {
      name: 'form',
      type: 'relationship',
      relationTo: FORMS_SLUG,
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'summary',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'The first few answers, so the list is readable at a glance.',
      },
    },
    {
      name: 'values',
      type: 'json',
      required: true,
      label: 'Answers',
      admin: { readOnly: true, description: 'Exactly what was submitted, keyed by field name.' },
    },
    {
      name: 'submittedAt',
      type: 'date',
      index: true,
      admin: {
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        // Kept alongside the automatic createdAt because a resend or an import
        // can carry an original time that createdAt cannot.
        description: 'When the visitor pressed send.',
      },
    },
    {
      name: 'ip',
      type: 'text',
      label: 'IP address',
      admin: {
        readOnly: true,
        description:
          'Recorded for spam investigation. It is personal data - the retention setting in Settings > Forms applies to it too.',
      },
    },
    { name: 'userAgent', type: 'text', admin: { readOnly: true } },
    {
      type: 'row',
      fields: [
        {
          name: 'total',
          type: 'number',
          admin: { width: '50%', readOnly: true, description: 'Priced on the server at submission time.' },
        },
        {
          name: 'currency',
          type: 'text',
          admin: { width: '50%', readOnly: true },
        },
      ],
    },
    {
      name: 'paymentStatus',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'Not a paid form', value: 'none' },
        { label: 'Awaiting payment', value: 'unpaid' },
        { label: 'Paid', value: 'paid' },
      ],
      admin: {
        readOnly: true,
        description:
          'Stays on "Awaiting payment" until the checkout handoff is finished - see the note in the Forms feature.',
      },
    },
    {
      name: 'lineItems',
      type: 'json',
      admin: { readOnly: true, description: 'The priced rows this entry produced.' },
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Read', value: 'read' },
        { label: 'Spam', value: 'spam' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: { position: 'sidebar', description: 'Where this entry is in your inbox.' },
    },
    {
      name: 'assignee',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar', description: 'Who is dealing with this entry.' },
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: { description: 'Private notes. Never shown to the visitor.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      admin: { readOnly: true, description: 'The page the form was sent from, or the website that embeds it.' },
    },
    {
      name: 'consent',
      type: 'json',
      admin: { readOnly: true, description: 'Consent given with this entry: the wording, the time and the policy link, kept as the record of consent.' },
    },
    {
      name: 'webhookDeliveries',
      type: 'json',
      admin: { readOnly: true, description: 'Every webhook attempt for this entry, newest last.' },
    },
    {
      name: 'webhookState',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'none, ok, retry or failed.' },
    },
    {
      name: 'webhookRetryAt',
      type: 'text',
      admin: { readOnly: true, description: 'When the next webhook retry is due.' },
    },
    {
      name: 'notificationStatus',
      type: 'text',
      admin: { readOnly: true, description: 'Whether the notification and confirmation emails went out.' },
    },
  ],
  timestamps: true,
}
