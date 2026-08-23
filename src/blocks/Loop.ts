import type { Block } from 'payload'

import { blockStyleField } from './styleField'

/**
 * Elementor-style loop grid: renders one copy of a Page Template for every
 * item in a collection.
 *
 * The chosen template's blocks are rendered once per item with merge tags
 * ({{title}}, {{price}}, {{field:my_field}} ...) resolved against that item -
 * see src/lib/mergeTags.ts. That makes a template double as a reusable card
 * design: build it once on the canvas, point a loop at a collection, and every
 * product/post/event renders through it.
 */
export const LoopBlock: Block = {
  slug: 'loop',
  labels: { singular: 'Loop', plural: 'Loops' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'template',
      type: 'relationship',
      relationTo: 'page-templates',
      required: true,
      admin: {
        description:
          'The Page Template used as the card design. Use merge tags inside it - e.g. {{title}}, {{image}}, {{price}}, {{url}} - and each item fills them in.',
      },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'products',
      options: [
        { label: 'Products', value: 'products' },
        { label: 'Blog posts', value: 'posts' },
        { label: 'Events', value: 'events' },
        { label: 'FAQs', value: 'faqs' },
        { label: 'Pages', value: 'pages' },
      ],
    },
    {
      name: 'category',
      type: 'text',
      admin: { description: 'Optional - only include items in this category. Leave blank for all.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'limit', type: 'number', defaultValue: 6, min: 1, max: 48, admin: { width: '33%' } },
        { name: 'columns', type: 'number', defaultValue: 3, min: 1, max: 6, admin: { width: '33%' } },
        {
          name: 'sortBy',
          type: 'select',
          defaultValue: 'newest',
          options: [
            { label: 'Newest first', value: 'newest' },
            { label: 'Oldest first', value: 'oldest' },
            { label: 'Title A-Z', value: 'title' },
          ],
          admin: { width: '33%' },
        },
      ],
    },
    blockStyleField,
  ],
}
