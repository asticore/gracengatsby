import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'

/**
 * The record of every email the site has tried to send (see
 * src/features/email/emailLog.ts). Entries are written by the send path, never
 * by hand: create and update are closed to everyone, admins included, so the
 * log says what was actually sent. Deleting an entry is allowed for anyone with
 * the delete permission, and old entries also age out after 90 days.
 *
 * The field names must keep matching the columns in
 * src/migrations/20261024_300000_email_log.ts, which builds the table by hand.
 */
export const EmailLog: CollectionConfig = {
  slug: 'email-log',
  dbName: 'eg_email_log',
  labels: { singular: 'Sent email', plural: 'Email log' },
  admin: {
    group: 'Settings',
    useAsTitle: 'subject',
    defaultColumns: ['createdAt', 'to', 'subject', 'template', 'status'],
    description:
      'Every email the site has sent or tried to send. Entries cannot be edited here. Use Resend on an entry to send its message again. Entries older than 90 days are removed automatically.',
    components: {
      edit: {
        beforeDocumentControls: ['@/features/email/admin/ResendEmailControl#ResendEmailControl'],
      },
    },
  },
  access: {
    read: roleAccess('email-log', 'read'),
    create: () => false,
    update: () => false,
    delete: roleAccess('email-log', 'delete'),
  },
  fields: [
    { name: 'to', type: 'text', label: 'To', admin: { readOnly: true } },
    { name: 'subject', type: 'text', admin: { readOnly: true } },
    {
      name: 'template',
      type: 'text',
      defaultValue: 'other',
      admin: { readOnly: true, description: 'Which kind of email this was, such as order.completed or resend.' },
    },
    { name: 'provider', type: 'text', admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'sent',
      options: [
        { label: 'Sent', value: 'sent' },
        { label: 'Failed', value: 'failed' },
        { label: 'Skipped', value: 'skipped' },
      ],
      admin: { readOnly: true, description: 'Failed means the provider refused it. Skipped means the site was not set up to send it.' },
    },
    { name: 'error', type: 'textarea', label: 'Error', admin: { readOnly: true } },
    { name: 'html', type: 'textarea', label: 'HTML body', admin: { readOnly: true } },
    { name: 'text', type: 'textarea', label: 'Plain text body', admin: { readOnly: true } },
    {
      name: 'resentFrom',
      type: 'number',
      label: 'Resent from entry ID',
      admin: { readOnly: true, description: 'Set when this email was sent again from an earlier entry.' },
    },
  ],
  timestamps: true,
  versions: false,
}
