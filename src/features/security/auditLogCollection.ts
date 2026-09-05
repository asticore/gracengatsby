import type { CollectionConfig } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'

/**
 * The read-only view over `eg_audit_log`.
 *
 * Nothing writes through this collection - entries arrive by direct insert (see
 * auditLog.ts) - so create, update and delete are closed to everyone including
 * admins. An audit trail an administrator can quietly edit answers the wrong
 * question when it is finally consulted, and the retention setting is the only
 * sanctioned way for an entry to disappear.
 *
 * The field names here must keep matching the columns the migration creates,
 * because the two are written independently: the migration builds the table by
 * hand rather than through the schema generator, for the reason given in its
 * own header.
 */
export const AuditLog: CollectionConfig = {
  slug: 'audit-log',
  dbName: 'eg_audit_log',
  labels: { singular: 'Audit entry', plural: 'Audit log' },
  admin: {
    group: 'Settings',
    useAsTitle: 'action',
    defaultColumns: ['createdAt', 'action', 'actorEmail', 'collectionSlug', 'documentId', 'ip'],
    description:
      'A record of sign-ins and changes. Entries cannot be edited or removed here - they age out on their own once past the retention period set on the Security screen.',
  },
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'action', type: 'text', required: true, index: true },
    { name: 'actorId', type: 'number', label: 'Actor ID' },
    { name: 'actorEmail', type: 'text', label: 'Actor', index: true },
    { name: 'collectionSlug', type: 'text', label: 'Collection' },
    { name: 'documentId', type: 'text', label: 'Item' },
    { name: 'ip', type: 'text', label: 'Address' },
    { name: 'userAgent', type: 'text', label: 'Browser' },
    { name: 'detail', type: 'textarea' },
  ],
  timestamps: true,
  versions: false,
}
