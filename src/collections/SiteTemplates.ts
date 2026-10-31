import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { embedShortLinksFor } from '@/features/embeds/hooks'
import { locksField } from '../fields/locks'
import { lockGuard } from '@/features/roles/lockGuard'
import { KIND_LABELS, SITE_TEMPLATE_KINDS, type SiteTemplateKind } from '@/features/siteTemplates/kinds'

/** Which part of the site a template draws. The resolver (src/features/siteTemplates) matches on this. */
export { SITE_TEMPLATE_KINDS, KIND_LABELS }
export type { SiteTemplateKind }

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
      // The list screen is the Templates hub (admin/templates), which holds the starters and the import. The edit screen only exports this one template.
      edit: {
        beforeDocumentControls: ['@/features/siteTemplates/admin/ExportTemplateLink#ExportTemplateLink', '@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton', '@/fields/locks/DocumentLockControl#DocumentLockControl'],
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
    beforeChange: [lockGuard, embedShortLinksFor('blocks')],
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
