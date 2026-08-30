import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/access/ecommerceAccess'

/**
 * The read-only view over `eg_backups`.
 *
 * Nothing writes through this collection - rows arrive by direct insert from
 * the run itself (see record.ts), because the scheduled path has no engine
 * instance. So create and update are closed to everyone, including admins: a
 * backup history someone can edit cannot be used to answer "when did we last
 * have a good copy", which is the only question it exists to answer.
 *
 * Delete is left open to admins, unlike the audit log. A backup record points
 * at bytes at a destination the operator pays for and controls; if they clear
 * one out by hand at the far end, they need a way to tidy the row that points
 * at it. Deleting the row does not delete the backup - retention does that.
 *
 * The field names here must keep matching the columns the migration creates:
 * the two are written independently, for the reason given in the migration's
 * own header.
 */
export const Backups: CollectionConfig = {
  slug: 'backups',
  dbName: 'eg_backups',
  labels: { singular: 'Backup', plural: 'Backups' },
  admin: {
    group: 'Settings',
    useAsTitle: 'backupId',
    defaultColumns: ['startedAt', 'status', 'triggerSource', 'contents', 'destination', 'sizeBytes'],
    description:
      'Every backup that has been attempted, and how it went. A run still showing as "running" long after it started did not finish - take another one before relying on it.',
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'backupId',
      type: 'text',
      label: 'Reference',
      index: true,
      admin: { description: 'The folder this backup was written to at the destination.' },
    },
    { name: 'startedAt', type: 'date', label: 'Started' },
    { name: 'finishedAt', type: 'date', label: 'Finished' },
    {
      name: 'triggerSource',
      type: 'text',
      label: 'Started by',
      admin: { description: 'Scheduled, or someone pressing Back up now.' },
    },
    { name: 'contents', type: 'text', admin: { description: 'Which parts were included.' } },
    { name: 'destination', type: 'text', admin: { description: 'The bucket the copy went to.' } },
    { name: 'storagePath', type: 'text', label: 'Path' },
    {
      name: 'status',
      type: 'text',
      index: true,
      admin: {
        description:
          '"partial" means the copy was written but something was left out - the reason is in Error.',
      },
    },
    {
      name: 'sizeBytes',
      type: 'number',
      label: 'Size (bytes)',
    },
    { name: 'tablesBackedUp', type: 'number', label: 'Tables' },
    { name: 'mediaObjects', type: 'number', label: 'Media files' },
    {
      name: 'error',
      type: 'textarea',
      admin: { description: 'What went wrong, in the destination’s own words where it said anything.' },
    },
  ],
  timestamps: true,
  versions: false,
}
