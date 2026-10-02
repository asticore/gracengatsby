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
    description: 'Leave blank to fall back to the site-wide SEO defaults.',
  },
  fields: [
    { name: 'metaTitle', type: 'text', label: 'Meta title' },
    { name: 'metaDescription', type: 'textarea', label: 'Meta description' },
    { name: 'canonicalUrl', type: 'text', label: 'Canonical URL', admin: { description: 'Only set this if another page is the original of this content.' } },
    { name: 'noIndex', type: 'checkbox', defaultValue: false, label: 'Hide from search engines (noindex)' },
    { name: 'noFollow', type: 'checkbox', defaultValue: false, label: 'Ask search engines not to follow links (nofollow)' },
    { name: 'socialTitle', type: 'text', label: 'Social title', admin: { description: 'Shown when the page is shared. Falls back to the meta title.' } },
    { name: 'socialDescription', type: 'textarea', label: 'Social description', admin: { description: 'Falls back to the meta description.' } },
    { name: 'ogImage', type: 'upload', relationTo: 'media', label: 'Social image (shown when shared)', admin: { description: 'Recommended 1200x630.' } },
    { name: 'xCard', type: 'select', options: [{ label: 'Summary', value: 'summary' }, { label: 'Large image', value: 'summary_large_image' }], defaultValue: 'summary_large_image', label: 'X card type' },
    { name: 'xImage', type: 'upload', relationTo: 'media', label: 'X image (optional)', admin: { description: 'Leave blank to use the social image.' } },
  ],
}
