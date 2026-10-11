import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'
import { can } from '@/features/roles/permissions'

import { reviewEndpoint } from '../reviewEndpoint'
import { refreshRatingSummary } from '../reviewSummary'

type StaffUser = Parameters<typeof can>[0]
const isStaff = (user: unknown, action: 'read' | 'update'): boolean => can(user as StaffUser, 'product-reviews', action, {})

/**
 * Customer reviews. Created only through POST /api/product-reviews/submit (rate limited, honeypot,
 * always pending), so the REST create is admin-only. Anyone can read approved reviews; the
 * reviewer's email is only visible to staff. Approving, un-approving or deleting a review refreshes
 * the cached rating on the product.
 */
export const ProductReviews: CollectionConfig = {
  slug: 'product-reviews',
  dbName: 'eg_product_reviews',
  labels: { singular: 'Product review', plural: 'Product reviews' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'name',
    defaultColumns: ['name', 'product', 'rating', 'status', 'createdAt'],
    description: 'Moderation queue: new reviews arrive as Pending and only show on the shop once Approved.',
  },
  access: {
    create: roleAccess('product-reviews', 'create'),
    read: ({ req }) => (isStaff(req.user, 'read') ? true : { status: { equals: 'approved' } }),
    update: roleAccess('product-reviews', 'update'),
    delete: roleAccess('product-reviews', 'delete'),
  },
  timestamps: true,
  endpoints: [reviewEndpoint],
  defaultSort: '-createdAt',
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    {
      name: 'email',
      type: 'email',
      access: { read: ({ req }) => isStaff(req.user, 'read') },
      admin: { description: 'Never shown publicly.' },
    },
    { name: 'rating', type: 'number', required: true, min: 1, max: 5 },
    { name: 'text', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      index: true,
      admin: { position: 'sidebar' },
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Approved', value: 'approved' },
        { label: 'Spam', value: 'spam' },
      ],
    },
    { name: 'verifiedOwner', type: 'checkbox', defaultValue: false, admin: { position: 'sidebar', description: 'Set automatically when the email matches an order for this product.' } },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        const productId = typeof doc.product === 'object' && doc.product ? (doc.product as { id: number }).id : (doc.product as number)
        const previousProduct = previousDoc ? (typeof previousDoc.product === 'object' && previousDoc.product ? (previousDoc.product as { id: number }).id : (previousDoc.product as number)) : null
        if (productId) await refreshRatingSummary(req.engine, productId)
        if (previousProduct && previousProduct !== productId) await refreshRatingSummary(req.engine, previousProduct)
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const productId = typeof doc?.product === 'object' && doc.product ? (doc.product as { id: number }).id : (doc?.product as number | undefined)
        if (productId) await refreshRatingSummary(req.engine, productId)
        return doc
      },
    ],
  },
}
