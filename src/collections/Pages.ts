import type { CollectionConfig, PayloadRequest } from 'payload'

import { adminOrPublishedStatus, isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'
import { seoFields } from '../fields/seo'
import { formatSlugHook, slugify } from '../utilities/formatSlug'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'parent', 'isHomepage', '_status'],
    group: 'Site Settings',
    description:
      'Every page on the site, including the homepage. Build sections from the block library (drag the ⚿ handle to reorder), set a Parent to nest it under another page, and add it to the menu under Header. Click "Edit visually" above to lay it out on a drag-and-drop canvas instead.',
    components: {
      edit: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: adminOrPublishedStatus,
    update: isAdmin,
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
        { req, data, id }: { req: PayloadRequest; data?: Record<string, unknown>; id?: unknown },
      ) => {
        const slug = typeof value === 'string' && value.length > 0 ? value : slugify(String(data?.title || ''))
        if (!slug) return 'A slug or title is required.'

        const parentId = data?.parent
          ? typeof data.parent === 'object'
            ? (data.parent as { id?: string | number }).id
            : data.parent
          : null

        const { docs } = await req.payload.find({
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
        description: 'Optional - nest this page under another page (controls its URL and shows page structure).',
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
      minRows: 1,
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: { initCollapsed: true },
    },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        // Apply a starting template's blocks on create, only if none set yet.
        if (operation === 'create' && data?.template && (!data.blocks || data.blocks.length === 0)) {
          const templateId = typeof data.template === 'object' ? data.template.id : data.template
          try {
            const template = await req.payload.findByID({ collection: 'page-templates', id: templateId })
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
      async ({ data, req, originalDoc }) => {
        // Only one page can be the homepage - unset any previous holder.
        if (data?.isHomepage) {
          const { docs } = await req.payload.find({
            collection: 'pages',
            where: {
              and: [{ isHomepage: { equals: true } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])],
            },
            limit: 50,
            depth: 0,
          })
          await Promise.all(
            docs.map((doc) => req.payload.update({ collection: 'pages', id: doc.id, data: { isHomepage: false } })),
          )
        }
        return data
      },
    ],
  },
}
