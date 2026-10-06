import type { CollectionConfig, EngineRequest } from '@/engine'

import { roleAccess, roleOrPublished } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { seoFields } from '../fields/seo'
import { schemaTypeField } from '../fields/schemaType'
import { authorshipFields, authorshipBeforeChange } from '../fields/authorship'
import { formatSlugHook, slugify } from '../utilities/formatSlug'
import { customFieldsField } from '../fields/customFields'
import { membersOnlyField } from '@/features/members'
import { contentEditGuard, publishGuard } from '@/features/roles/contentEditGuard'

export const Pages: CollectionConfig = {
  slug: 'pages',
  dbName: 'eg_pages',
  labels: { plural: 'Pages', singular: 'Page' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'parent', 'isHomepage', '_status'],
    group: 'Content',
    description:
      'Every page on the site, including the homepage. Build sections from the block library (drag the ⚿ handle to reorder), set a Parent to nest it under another page, and add it to the menu under Header. Click "Edit visually" above to lay it out on a drag-and-drop canvas instead.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: roleAccess('pages', 'create'),
    delete: roleAccess('pages', 'delete'),
    read: roleOrPublished('pages'),
    update: roleAccess('pages', 'update'),
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'title', type: 'text', required: true, admin: { width: '70%' } },
        { name: 'isHomepage', type: 'checkbox', defaultValue: false, admin: { width: '30%', description: 'Serve this page at "/" instead of its slug.' } },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      admin: {
        position: 'sidebar',
        description:
          'Auto-fills from the title as you type - edit it here to override. Combined with Parent to build the URL - e.g. parent "services" + slug "consulting" -> /services/consulting.',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: {
        beforeValidate: [formatSlugHook('title')],
      },
      validate: async (
        value: unknown,
        { req, data, id }: { req: EngineRequest; data?: Record<string, unknown>; id?: unknown },
      ) => {
        const slug = typeof value === 'string' && value.length > 0 ? value : slugify(String(data?.title || ''))
        if (!slug) return 'A slug or title is required.'

        const parentId = data?.parent
          ? typeof data.parent === 'object'
            ? (data.parent as { id?: string | number }).id
            : data.parent
          : null

        const { docs } = await req.engine.find({
          collection: 'pages',
          where: {
            and: [
              { slug: { equals: slug } },
              parentId ? { parent: { equals: parentId } } : { parent: { exists: false } },
              ...(id ? [{ id: { not_equals: id } }] : []),
            ],
          },
          limit: 1,
          depth: 0,
        })

        if (docs.length > 0) {
          return 'Another page with this slug already exists under the same parent. Choose a different slug or parent.'
        }

        return true
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'pages',
      admin: {
        position: 'sidebar',
        components: {
          Field: '@/fields/parentPicker/ParentPicker#ParentPicker',
        },
        description: 'Optional - nest this page under another page (controls its URL and shows page structure).',
      },
    },
    {
      name: 'sortOrder',
      type: 'number',
      defaultValue: 0,
      admin: {
        hidden: true,
        position: 'sidebar',
        description: 'Order among sibling pages. Set by dragging in the Tree view.',
      },
    },
    {
      name: 'template',
      type: 'relationship',
      relationTo: 'page-templates',
      admin: {
        position: 'sidebar',
        description:
          'Pick a starting template - its sections are copied in only when creating a brand-new page with no sections yet.',
      },
    },
    seoFields,
    {
      name: 'blocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
    customFieldsField,
    membersOnlyField,
    ...authorshipFields,
    schemaTypeField('pages'),
  ],
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        // Apply a starting template's blocks on create, only if none set yet.
        if (operation === 'create' && data?.template && (!data.blocks || data.blocks.length === 0)) {
          const templateId = typeof data.template === 'object' ? data.template.id : data.template
          try {
            const template = await req.engine.findByID({ collection: 'page-templates', id: templateId })
            if (template?.blocks?.length) {
              data.blocks = template.blocks
            }
          } catch {
            // Template missing/deleted - just leave blocks empty, no hard failure.
          }
        }
        return data
      },
    ],
    beforeChange: [
      authorshipBeforeChange,
      async ({ data, req, originalDoc }) => {
        // Only one page can be the homepage - unset any previous holder.
        if (data?.isHomepage) {
          const { docs } = await req.engine.find({
            collection: 'pages',
            where: {
              and: [{ isHomepage: { equals: true } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])],
            },
            limit: 50,
            depth: 0,
            // This is bookkeeping on the previous homepage, not something the editor asked to change,
            // so it must not depend on the editor's own update rights, and it must keep that page's
            // published/draft state (an update without _status would turn it back into a draft).
            overrideAccess: true,
          })
          await Promise.all(
            docs.map((doc) =>
              req.engine.update({
                collection: 'pages',
                id: doc.id,
                data: { isHomepage: false, _status: (doc as { _status?: 'draft' | 'published' })._status },
                overrideAccess: true,
              }),
            ),
          )
        }
        return data
      },
      contentEditGuard,
      publishGuard,
    ],
  },
}
