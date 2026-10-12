import type { CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { DATA_VIEWS_SLUG, DATA_VIEWS_TABLE } from '../slugs'
import { VIEW_KINDS, VIEW_SOURCES, KIND_LABELS, SOURCE_LABELS } from '../types'

const EDITOR_FIELD = '@/features/dataViews/admin/DataViewEditorField#DataViewEditorField'

/**
 * A saved table or chart. The big editor is the `config` field's custom component; `kind`, `source`,
 * the link name and the public switch are real columns so they can be listed and looked up.
 *
 * Reading through the API needs the data-views permission; the public share page and data endpoints
 * are separate routes that check the public switch themselves (src/app/embed, src/app/(engage)/api/data-view).
 */
export const DataViews: CollectionConfig = {
  slug: DATA_VIEWS_SLUG,
  dbName: DATA_VIEWS_TABLE,
  labels: { singular: 'Table or chart', plural: 'Tables and charts' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'kind', 'source', 'isPublic', 'updatedAt'],
    group: 'Content',
    description: 'Build a table or chart from your site content, a typed-in grid or a spreadsheet. Place it on a page with the Table or chart element, or share its link.',
  },
  access: {
    create: roleAccess('data-views', 'create'),
    delete: roleAccess('data-views', 'delete'),
    read: roleAccess('data-views', 'read'),
    update: roleAccess('data-views', 'update'),
  },
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'Only you see this name. Visitors see the caption you set under Display.' } },
    {
      type: 'row',
      fields: [
        { name: 'kind', type: 'select', required: true, defaultValue: 'table', options: VIEW_KINDS.map((value) => ({ label: KIND_LABELS[value], value })), admin: { width: '50%' } },
        { name: 'source', type: 'select', required: true, defaultValue: 'custom-fields', options: VIEW_SOURCES.map((value) => ({ label: SOURCE_LABELS[value], value })), admin: { width: '50%' } },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', description: 'Optional short name for links, for example sales-by-month. Lowercase letters, digits and dashes. Used in the share link and data links.' },
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      defaultValue: false,
      label: 'Share link and data links are public',
      admin: { position: 'sidebar', description: 'On: anyone with the link can open the embed page and download the CSV or JSON. Off: only signed-in editors can. A table placed on a page is always shown with that page.' },
    },
    {
      name: 'config',
      type: 'json',
      label: 'Data and display',
      admin: { components: { Field: EDITOR_FIELD } },
    },
  ],
  defaultSort: 'title',
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc }) => {
        if (!data) return data
        const [{ normalizeConfig, normalizeSlug, normalizeDataView }, { validateDataView }] = await Promise.all([import('../config'), import('../validate')])
        const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
        const next: Record<string, unknown> = { ...data }
        if ('slug' in data) next.slug = normalizeSlug(data.slug)
        if ('config' in data) next.config = normalizeConfig(data.config)
        const def = normalizeDataView({ ...merged, ...next })
        let groups = null
        try {
          groups = await (await import('@/features/customFields/server')).loadFieldGroups()
        } catch {
          // Without the field groups only the structural checks run; the read side still enforces the allow-list.
        }
        const problems = validateDataView(def, groups, data.slug)
        if (problems.length > 0) {
          const { ValidationError } = await import('@/localapi/operations')
          throw new ValidationError(problems.map((message) => ({ path: 'config', message })))
        }
        return next
      },
    ],
  },
}
