import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'

/**
 * Errors the site has recorded (see src/features/errors/log.ts). Written by the
 * server when a request fails, never by hand, so create is closed to everyone.
 * Only the status can be changed here; the rest is a record of what happened.
 * Ignored and fixed entries are removed after 30 days, and the log keeps at most
 * 1000 entries.
 *
 * The field names must keep matching the columns in
 * src/migrations/20261026_400000_error_log.ts, which builds the table by hand.
 */
export const ErrorLog: CollectionConfig = {
  slug: 'error-log',
  dbName: 'eg_error_log',
  labels: { singular: 'Error', plural: 'Error log' },
  admin: {
    group: 'Settings',
    useAsTitle: 'message',
    defaultColumns: ['lastSeen', 'source', 'message', 'count', 'status'],
    description:
      'Errors the site ran into, with the same error counted once. Passwords, keys and email addresses are removed before saving. Mark an entry as fixed or ignored to hide it; those entries are removed after 30 days.',
  },
  access: {
    read: roleAccess('error-log', 'read'),
    create: () => false,
    update: roleAccess('error-log', 'update'),
    delete: roleAccess('error-log', 'delete'),
  },
  fields: [
    {
      name: 'source',
      type: 'text',
      admin: { readOnly: true, description: 'Where the error came from, such as client (the browser), paypal-webhook or form-submit.' },
    },
    { name: 'message', type: 'text', admin: { readOnly: true, description: 'What went wrong. Cut to 1000 characters.' } },
    { name: 'stack', type: 'textarea', label: 'Stack trace', admin: { readOnly: true, description: 'The code path that failed. Cut to 4000 characters.' } },
    { name: 'path', type: 'text', admin: { readOnly: true, description: 'The page or address that was open. Query strings are not kept.' } },
    { name: 'userAgent', type: 'text', label: 'Browser', admin: { readOnly: true, description: 'The browser or client that reported it.' } },
    {
      name: 'count',
      type: 'number',
      defaultValue: 1,
      admin: { readOnly: true, description: 'How many times this error happened in the last day, or in total for the entry.' },
    },
    { name: 'firstSeen', type: 'date', label: 'First seen', admin: { readOnly: true } },
    { name: 'lastSeen', type: 'date', label: 'Last seen', admin: { readOnly: true } },
    { name: 'fingerprint', type: 'text', admin: { readOnly: true, description: 'Identifies the error so repeats are counted together.' } },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'open',
      options: [
        { label: 'Open', value: 'open' },
        { label: 'Ignored', value: 'ignored' },
        { label: 'Fixed', value: 'fixed' },
      ],
      admin: { description: 'Open entries stay in the list. Ignored and fixed entries are removed 30 days after they were last seen.' },
    },
  ],
  timestamps: true,
  versions: false,
}
