import type { Field } from '@/engine'

/**
 * Reusable per-document SEO group. Falls back to Site Settings > SEO Defaults
 * when left blank (see src/utilities/seo.ts for the merge logic used when
 * rendering <head> metadata).
 */
export const seoFields: Field = {
  type: 'group',
  name: 'seo',
  label: 'SEO',
  admin: {
    position: 'sidebar',
    description: 'Leave blank to fall back to the site-wide SEO defaults.',
  },
  fields: [
    { name: 'metaTitle', type: 'text' },
    { name: 'metaDescription', type: 'textarea' },
    { name: 'ogImage', type: 'upload', relationTo: 'media' },
    { name: 'noIndex', type: 'checkbox', defaultValue: false, admin: { description: 'Ask search engines not to index this page.' } },
  ],
}
