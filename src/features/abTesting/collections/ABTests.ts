import type { CollectionConfig, PayloadRequest } from 'payload'

import { isAdmin } from '@/access/ecommerceAccess'

import { clearTestManifest } from '../manifest'
import { AB_TESTS_SLUG, AB_TESTS_TABLE } from '../slugs'

/**
 * One split test: what is being swapped, for whom, and what counts as a win.
 *
 * Every test targets exactly one page. That is a real restriction and a
 * deliberate one - a test spanning several pages needs a shared denominator
 * across them, and the moment "visitors" means different things on different
 * pages the conversion rate stops being comparable. One page, one denominator.
 *
 * Variant content is a relationship rather than a nested blocks field. The
 * engine generates one child table per block type per blocks field, so putting
 * the page-builder library inside this array would add a dozen tables that
 * exist purely to hold a copy of content the site can already store. Pointing
 * at an existing page (or, for a section test, a page template) reuses the
 * visual editor, keeps the schema flat, and means the variant can be previewed
 * on its own before the test starts.
 */

type VariantRow = { key?: string | null; isControl?: boolean | null }
type GoalRow = { key?: string | null }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Assigns each row a key it keeps for the life of the test.
 *
 * Keys are written into visitor cookies and into every event row, so they can
 * never be positional: reordering the array or deleting the middle arm would
 * otherwise silently re-label months of collected data. Existing keys are left
 * exactly as they are and only blank ones are filled, with the first unused
 * letter rather than the next one along.
 */
const withKeys = <T extends { key?: string | null }>(rows: T[] | null | undefined, prefix: string): T[] => {
  const list = Array.isArray(rows) ? rows : []
  const used = new Set(list.map((row) => (row.key || '').trim()).filter(Boolean))

  return list.map((row) => {
    if (row.key && row.key.trim()) return row
    for (const letter of LETTERS) {
      const candidate = prefix ? `${prefix}${letter}` : letter
      if (!used.has(candidate)) {
        used.add(candidate)
        return { ...row, key: candidate }
      }
    }
    const fallback = `${prefix}${used.size + 1}`
    used.add(fallback)
    return { ...row, key: fallback }
  })
}

/**
 * The public path of the targeted page, stored on the test.
 *
 * Denormalised on purpose. The edge decides whether a request is under test
 * before anything has looked a page up, and it cannot afford to resolve a
 * parent chain to find out. Recomputed on every save, so moving a page under a
 * new parent is picked up the next time the test is touched.
 */
const resolveTargetPath = async (req: PayloadRequest, pageId: unknown): Promise<string> => {
  if (!pageId) return ''
  const id = typeof pageId === 'object' ? (pageId as { id?: unknown }).id : pageId
  if (id === undefined || id === null) return ''

  const segments: string[] = []
  let current: unknown = id

  for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth += 1) {
    const page = (await req.payload
      .findByID({ collection: 'pages', id: current as string, depth: 0, overrideAccess: true })
      .catch((): null => null)) as { slug?: string; parent?: unknown; isHomepage?: boolean } | null
    if (!page) break
    if (page.isHomepage) return '/'
    if (page.slug) segments.unshift(page.slug)
    current = page.parent ?? null
  }

  return segments.length > 0 ? `/${segments.join('/')}` : ''
}

export const ABTests: CollectionConfig = {
  slug: AB_TESTS_SLUG,
  dbName: AB_TESTS_TABLE,
  labels: { singular: 'A/B test', plural: 'A/B tests' },
  admin: {
    useAsTitle: 'name',
    group: 'Content',
    defaultColumns: ['name', 'status', 'targetPath', 'startsAt', 'endsAt'],
    description:
      'Show different versions of a page or a section to different visitors and record which one performs better. Nothing is split until the status is Running.',
  },
  access: {
    create: isAdmin,
    read: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text', required: true, admin: { width: '60%' } },
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          index: true,
          admin: {
            width: '40%',
            description:
              'Only Running splits traffic. Stopped keeps every number collected so far and puts everybody back on the original.',
          },
          options: [
            { label: 'Draft - not live', value: 'draft' },
            { label: 'Running', value: 'running' },
            { label: 'Stopped', value: 'stopped' },
          ],
        },
      ],
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      required: true,
      index: true,
      admin: { description: 'The page under test. Its visitors are the denominator for every goal.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'scope',
          type: 'select',
          required: true,
          defaultValue: 'page',
          admin: { width: '50%' },
          options: [
            { label: 'Whole page', value: 'page' },
            { label: 'One section on the page', value: 'block' },
          ],
        },
        {
          name: 'blockId',
          type: 'text',
          admin: {
            width: '50%',
            condition: (data) => data?.scope === 'block',
            description:
              'The id of the section being replaced. Copy it from the section row on the page - it is the value shown in the section\'s ID field.',
          },
        },
      ],
    },
    {
      name: 'targetPath',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Filled in from the page above. This is what the cache and the edge match on.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          type: 'date',
          admin: { width: '50%', description: 'Optional. Before this, the original is served to everybody.' },
        },
        {
          name: 'endsAt',
          type: 'date',
          admin: { width: '50%', description: 'Optional. After this, the test stops splitting on its own.' },
        },
      ],
    },
    {
      name: 'variants',
      type: 'array',
      minRows: 2,
      labels: { singular: 'Variant', plural: 'Variants' },
      admin: {
        initCollapsed: false,
        description:
          'Weights are relative shares, not percentages: 50 and 50 is an even split, and so is 1 and 1. Mark exactly one variant as the control.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'key',
              type: 'text',
              admin: {
                width: '15%',
                readOnly: true,
                description: 'Fixed for life.',
              },
            },
            { name: 'label', type: 'text', required: true, admin: { width: '45%' } },
            {
              name: 'weight',
              type: 'number',
              required: true,
              defaultValue: 50,
              min: 0,
              admin: { width: '20%' },
            },
            {
              name: 'isControl',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '20%', description: 'Renders the original.' },
            },
          ],
        },
        {
          name: 'page',
          type: 'relationship',
          relationTo: 'pages',
          admin: {
            condition: (data, siblingData) => data?.scope === 'page' && !siblingData?.isControl,
            description: 'The page rendered instead of the original for this arm.',
          },
        },
        {
          name: 'template',
          type: 'relationship',
          relationTo: 'page-templates',
          admin: {
            condition: (data, siblingData) => data?.scope === 'block' && !siblingData?.isControl,
            description: "The template whose sections replace the targeted section.",
          },
        },
      ],
    },
    {
      name: 'goals',
      type: 'array',
      labels: { singular: 'Goal', plural: 'Goal' },
      admin: {
        initCollapsed: false,
        description:
          'What counts as a win. Each goal is measured separately, because an arm can win on clicks and lose on orders.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'key', type: 'text', admin: { width: '15%', readOnly: true } },
            { name: 'label', type: 'text', required: true, admin: { width: '40%' } },
            {
              name: 'type',
              type: 'select',
              required: true,
              defaultValue: 'page-visited',
              admin: { width: '45%' },
              options: [
                { label: 'Page visited', value: 'page-visited' },
                { label: 'Element clicked', value: 'element-clicked' },
                { label: 'Form submitted', value: 'form-submitted' },
                { label: 'Order placed', value: 'order-placed' },
              ],
            },
          ],
        },
        {
          name: 'path',
          type: 'text',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'page-visited',
            description: 'The path that counts, e.g. /thank-you.',
          },
        },
        {
          name: 'selector',
          type: 'text',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'element-clicked',
            description: 'A CSS selector, e.g. .hero .button--primary. Clicks inside a match count.',
          },
        },
        {
          name: 'form',
          type: 'relationship',
          relationTo: 'forms',
          admin: {
            condition: (_data, siblingData) => siblingData?.type === 'form-submitted',
            description: 'Leave empty to count any form on the page.',
          },
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description:
          'What you expected to happen, written down before the numbers arrive. The most useful field here.',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req }) => {
        data.variants = withKeys(data.variants as VariantRow[], '')
        data.goals = withKeys(data.goals as GoalRow[], 'g')
        data.targetPath = await resolveTargetPath(req, data.page)
        return data
      },
    ],
    afterChange: [
      () => {
        // The manifest is cached for a minute; an editor who just pressed Save
        // should not have to wait it out to see their own change.
        clearTestManifest()
      },
    ],
    afterDelete: [
      () => {
        clearTestManifest()
      },
    ],
  },
}
