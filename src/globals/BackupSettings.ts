import type { GlobalConfig } from 'payload'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Scheduled backups to storage you control.
 *
 * The destination is deliberately somewhere OTHER than this site. A backup
 * kept alongside the thing it is backing up does not survive the failure you
 * are protecting against, so there is no "keep a local copy" option.
 *
 * A note on the destination choices: R2 and S3 are ordinary web requests and
 * work from Cloudflare Workers. FTP and SFTP need a direct connection that
 * Workers cannot open, so those two only apply if backups are run from a
 * machine you control rather than from the site itself - the field
 * descriptions say so rather than letting someone fill them in and wonder.
 *
 * Credentials here are encrypted at rest in the database and readable only by
 * admins, so they can still be updated from this screen. Use keys scoped to the
 * one bucket or folder the backups live in, never a full-access key.
 */
export const BackupSettings: GlobalConfig = {
  slug: 'backup-settings',
  dbName: 'ac_backup_settings',
  admin: {
    group: 'Settings',
    description:
      'Where copies of your site are saved and how often. A backup you have never restored from is only a guess - download one occasionally and check it opens.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'schedule',
      label: 'Schedule',
      admin: { description: 'How often a copy is taken and how many are kept.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'Turn scheduled backups on once a destination below is filled in.' },
            },
            {
              name: 'frequency',
              type: 'select',
              defaultValue: 'weekly',
              admin: {
                width: '50%',
                description: 'Daily suits a busy shop. Weekly is plenty for a site that changes rarely.',
              },
              options: [
                { label: 'Daily', value: 'daily' },
                { label: 'Weekly', value: 'weekly' },
                { label: 'Monthly', value: 'monthly' },
              ],
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'timeOfDay',
              type: 'text',
              defaultValue: '03:00',
              admin: {
                width: '50%',
                description: 'A quiet hour, written as 24-hour time such as 03:00. Times are UTC, not your local clock.',
              },
            },
            {
              name: 'retentionCount',
              type: 'number',
              defaultValue: 7,
              admin: {
                width: '50%',
                description:
                  'How many backups to keep before the oldest is deleted. Keep enough to cover the time it might take you to notice a problem.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'contents',
      label: 'Contents',
      admin: {
        description:
          'What goes into each backup. Media is usually the bulk of the size - if backups get too large, that is the part to reconsider.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'database',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Pages, posts, products, orders and customers.' },
            },
            {
              name: 'media',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Everything in your media library.' },
            },
            {
              name: 'settings',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Your configuration, including these screens.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'destination',
      label: 'Destination',
      admin: { description: 'Where the backup files are sent. This should be storage separate from this site.' },
      fields: [
        {
          name: 'provider',
          type: 'select',
          defaultValue: 'r2',
          admin: {
            description:
              'Cloudflare R2 and Amazon S3 work directly from this site. FTP and SFTP need a direct connection that Cloudflare Workers cannot make, so they only apply if you run backups from your own machine or server.',
          },
          options: [
            { label: 'Cloudflare R2', value: 'r2' },
            { label: 'Amazon S3', value: 's3' },
            { label: 'FTP (requires a separate machine to run backups)', value: 'ftp' },
            { label: 'SFTP (requires a separate machine to run backups)', value: 'sftp' },
          ],
        },
        {
          type: 'group',
          name: 'r2',
          label: 'Cloudflare R2',
          admin: { condition: (_, s) => s?.provider === 'r2' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'accountId', type: 'text', admin: { width: '50%', description: 'From your Cloudflare dashboard.' } },
                { name: 'bucket', type: 'text', admin: { width: '50%', description: 'The R2 bucket backups are written to.' } },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'accessKeyId',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description: 'R2 access key ID. Stored encrypted at rest, visible only to admins.',
                  },
                },
                {
                  name: 'secretAccessKey',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description:
                      'R2 secret access key. Stored encrypted at rest, visible only to admins - scope it to this bucket only.',
                  },
                },
              ],
            },
            { name: 'path', type: 'text', admin: { description: 'Optional folder inside the bucket, such as backups/live.' } },
          ],
        },
        {
          type: 'group',
          name: 's3',
          label: 'Amazon S3',
          admin: { condition: (_, s) => s?.provider === 's3' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'bucket', type: 'text', admin: { width: '50%', description: 'The S3 bucket backups are written to.' } },
                { name: 'region', type: 'text', admin: { width: '50%', description: 'The bucket region, such as ap-southeast-2.' } },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'accessKeyId',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description: 'IAM access key ID. Stored encrypted at rest, visible only to admins.',
                  },
                },
                {
                  name: 'secretAccessKey',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description:
                      'IAM secret access key. Stored encrypted at rest, visible only to admins - scope it to this bucket only.',
                  },
                },
              ],
            },
            { name: 'path', type: 'text', admin: { description: 'Optional folder inside the bucket.' } },
          ],
        },
        {
          type: 'group',
          name: 'ftp',
          label: 'FTP',
          admin: { condition: (_, s) => s?.provider === 'ftp' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'host', type: 'text', admin: { width: '50%' } },
                { name: 'port', type: 'number', defaultValue: 21, admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'username', type: 'text', admin: { width: '50%' } },
                {
                  name: 'password',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description: 'Stored encrypted at rest, visible only to admins.',
                  },
                },
              ],
            },
            { name: 'path', type: 'text', admin: { description: 'The folder on the server to upload into.' } },
          ],
        },
        {
          type: 'group',
          name: 'sftp',
          label: 'SFTP',
          admin: { condition: (_, s) => s?.provider === 'sftp' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'host', type: 'text', admin: { width: '50%' } },
                { name: 'port', type: 'number', defaultValue: 22, admin: { width: '50%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'username', type: 'text', admin: { width: '50%' } },
                {
                  name: 'password',
                  type: 'text',
                  access: {
                    read: adminOnlyFieldAccess,
                    update: adminOnlyFieldAccess,
                  },
                  hooks: {
                    beforeChange: [encryptSecretHook],
                    afterRead: [decryptSecretHook],
                  },
                  admin: {
                    width: '50%',
                    description:
                      'Stored encrypted at rest, visible only to admins. Leave blank if you are using a private key instead.',
                  },
                },
              ],
            },
            {
              name: 'privateKey',
              type: 'text',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: {
                description:
                  'An SSH private key, if you prefer that to a password. Stored encrypted at rest, visible only to admins - use a key created solely for backups.',
              },
            },
            { name: 'path', type: 'text', admin: { description: 'The folder on the server to upload into.' } },
          ],
        },
      ],
    },
  ],
}
