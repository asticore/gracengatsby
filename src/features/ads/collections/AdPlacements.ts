import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { validatePlacement } from '../validate'
import { AD_PLACEMENTS_SLUG, AD_PLACEMENTS_TABLE, AD_UNITS_SLUG } from '../slugs'

/** Where a unit appears automatically (after paragraph N, header, footer, sidebar, in-feed) or by name from a page. */
export const AdPlacements: CollectionConfig = {
  slug: AD_PLACEMENTS_SLUG,
  dbName: AD_PLACEMENTS_TABLE,
  labels: { singular: 'Ad placement', plural: 'Ad placements' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'key', 'mode', 'enabled'],
    group: 'Ads',
    description: 'Drop a placement into a page with the Ad element (use its key), or let it insert itself in content, header, footer or lists.',
  },
  access: {
    create: roleAccess('ad-placements', 'create'),
    delete: roleAccess('ad-placements', 'delete'),
    read: roleAccess('ad-placements', 'read'),
    update: roleAccess('ad-placements', 'update'),
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'key', type: 'text', required: true, admin: { description: 'Lowercase letters, digits and dashes. Used by the Ad element.' } },
    { name: 'unit', type: 'relationship', relationTo: AD_UNITS_SLUG, required: true },
    {
      name: 'mode',
      type: 'select',
      required: true,
      defaultValue: 'manual',
      options: [
        { label: 'Manual (Ad element only)', value: 'manual' },
        { label: 'After paragraph N in rich text', value: 'after-paragraph' },
        { label: 'Sidebar', value: 'sidebar' },
        { label: 'In-feed every N items', value: 'in-feed' },
        { label: 'Site header', value: 'header' },
        { label: 'Site footer', value: 'footer' },
      ],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    {
      type: 'row',
      fields: [
        { name: 'afterParagraph', type: 'number', defaultValue: 3, admin: { width: '33%', condition: (_: unknown, s: Record<string, unknown>) => s?.mode === 'after-paragraph' } },
        { name: 'repeatEvery', type: 'number', defaultValue: 0, admin: { width: '33%', description: '0 = once', condition: (_: unknown, s: Record<string, unknown>) => s?.mode === 'after-paragraph' } },
        { name: 'feedEvery', type: 'number', defaultValue: 6, admin: { width: '33%', condition: (_: unknown, s: Record<string, unknown>) => s?.mode === 'in-feed' } },
      ],
    },
    { name: 'maxPerPage', type: 'number', defaultValue: 3 },
    {
      type: 'row',
      fields: [
        { name: 'onPages', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'onPosts', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
        { name: 'onProducts', type: 'checkbox', defaultValue: true, admin: { width: '33%' } },
      ],
    },
  ],
  defaultSort: 'name',
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc }) => {
        if (!data) return data
        const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
        const errors = validatePlacement(merged)
        if (errors.length) {
          const { ValidationError } = await import('@/localapi/operations')
          throw new ValidationError(errors.map((message) => ({ path: 'name', message })))
        }
        return data
      },
    ],
  },
}
