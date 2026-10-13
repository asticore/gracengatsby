import type { CollectionConfig } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'

import { FORMS_SLUG } from '../slugs'

/**
 * Save-and-continue drafts: a visitor saved half a form and was emailed a link to finish it later.
 *
 * Created only by POST /api/form-draft (rate limited, honeypot trapped), which writes with
 * overrideAccess after checking the form allows saving. The raw token only ever lives in the
 * emailed link; the row keeps a SHA-256 hash of it. Staff can look at and delete drafts, nothing
 * else. Drafts expire after 30 days and are removed once the form is sent with that link.
 */
export const FormDrafts: CollectionConfig = {
  slug: 'form-drafts',
  dbName: 'eg_form_drafts',
  labels: { singular: 'Saved form draft', plural: 'Saved form drafts' },
  admin: {
    group: 'Content',
    hidden: true,
    useAsTitle: 'email',
    defaultColumns: ['email', 'form', 'page', 'expiresAt'],
    description: 'Answers a visitor saved to finish a form later. They expire after 30 days.',
  },
  access: {
    create: () => false,
    read: isAdmin,
    update: () => false,
    delete: isAdmin,
  },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    { name: 'form', type: 'relationship', relationTo: FORMS_SLUG, required: true, index: true, admin: { readOnly: true } },
    { name: 'tokenHash', type: 'text', required: true, index: true, admin: { readOnly: true, description: 'A hash of the secret in the emailed link. The link itself is never stored.' } },
    { name: 'email', type: 'email', required: true, admin: { readOnly: true } },
    { name: 'dataJson', type: 'textarea', required: true, admin: { readOnly: true, description: 'The saved answers, as JSON.' } },
    { name: 'page', type: 'number', defaultValue: 0, admin: { readOnly: true, description: 'Which step of the form the visitor had reached.' } },
    { name: 'expiresAt', type: 'date', required: true, index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
  ],
}
