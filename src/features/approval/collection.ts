import type { CollectionConfig } from '@/engine'

import { isAdmin, roleAccess } from '@/access/ecommerceAccess'

/**
 * One row per step in a document's review: submitted, approved, changes asked for, a comment,
 * published, withdrawn. Written only by the approval routes (which run with overrideAccess), so
 * the REST API can read the history but never create or edit it.
 */
export const ReviewEvents: CollectionConfig = {
  slug: 'review-events',
  dbName: 'eg_review_events',
  labels: { singular: 'Review event', plural: 'Review events' },
  admin: {
    useAsTitle: 'docTitle',
    defaultColumns: ['docTitle', 'action', 'actorName', 'createdAt'],
    group: 'Content',
    description: 'The review history of content: who submitted, approved or asked for changes, and when.',
  },
  access: {
    create: () => false,
    delete: isAdmin,
    read: roleAccess('review', 'read'),
    update: () => false,
  },
  fields: [
    { name: 'collection', type: 'text', required: true, admin: { readOnly: true } },
    { name: 'docId', type: 'number', required: true, admin: { readOnly: true } },
    { name: 'docTitle', type: 'text', admin: { readOnly: true } },
    {
      name: 'action',
      type: 'select',
      required: true,
      options: [
        { label: 'Submitted', value: 'submitted' },
        { label: 'Approved', value: 'approved' },
        { label: 'Changes requested', value: 'changes_requested' },
        { label: 'Comment', value: 'comment' },
        { label: 'Published', value: 'published' },
        { label: 'Withdrawn', value: 'withdrawn' },
      ],
      admin: { readOnly: true },
    },
    { name: 'note', type: 'textarea', admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'actorName', type: 'text', admin: { readOnly: true } },
  ],
  defaultSort: '-createdAt',
}
