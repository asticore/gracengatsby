import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { locksField } from '../fields/locks'
import { lockGuard } from '@/features/roles/lockGuard'

/** Which part of the site a template draws. The resolver (src/features/siteTemplates) matches on this. */
export const SITE_TEMPLATE_KINDS = [
  'header',
  'footer',
  'single-post',
  'single-product',
  'single-event',
  'archive-blog',
  'archive-shop',
  'not-found',
  // 'search' returns when a public search page is built.
] as const

export type SiteTemplateKind = (typeof SITE_TEMPLATE_KINDS)[number]

const KIND_LABELS: Record<SiteTemplateKind, string> = {
  header: 'Header',
  footer: 'Footer',
  'single-post': 'Single post',
  'single-product': 'Single product',
  'single-event': 'Single event',
  'archive-blog': 'Blog archive',
  'archive-shop': 'Shop archive',
  'not-found': '404 page',
}

/**
 * Site templates: a header, footer or whole-page layout (single post, product, event, archives, 404) built from the same blocks as pages. Several can exist per kind; the enabled one whose
 * conditions match, with the highest priority, wins.
 */
export const SiteTemplates: CollectionConfig = {
  slug: 'site-templates',
  dbName: 'eg_site_templates',
  labels: { singular: 'Site Template', plural: 'Site Templates' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'enabled', 'priority'],
    group: 'Content',
    description:
      'Reusable headers, footers and page layouts for posts, products, events, archives, and 404. Built from the same sections as pages.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton', '@/fields/locks/DocumentLockControl#DocumentLockControl'],
      },
    },
  },
  access: {
    create: roleAccess('site-templates', 'create'),
    delete: roleAccess('site-templates', 'delete'),
    read: roleAccess('site-templates', 'read'),
    update: roleAccess('site-templates', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'single-post',
      options: SITE_TEMPLATE_KINDS.map((value) => ({ label: KIND_LABELS[value], value })),
      admin: { description: 'Which part of the site this template draws.' },
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    {
      name: 'priority',
      type: 'number',
      defaultValue: 10,
      min: 0,
      max: 999,
      admin: { description: 'Higher wins when several match.' },
    },
    {
      name: 'conditions',
      type: 'json',
      defaultValue: [],
      admin: {
        description: 'Where this template applies. Empty = everywhere for its kind.',
        components: { Field: '@/features/siteTemplates/admin/ConditionsField#ConditionsField' },
      },
    },
    {
      name: 'blocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
    locksField,
  ],
  hooks: {
    beforeChange: [lockGuard],
    afterChange: [
      async () => {
        // The public layout is dynamic (read on every request), so this is best-effort: it only clears any edge/route cache in front of it.
        try {
          const { revalidatePath } = await import('next/cache')
          revalidatePath('/', 'layout')
        } catch {
          // No request scope (scripts, tests): nothing to revalidate.
        }
      },
    ],
  },
}
