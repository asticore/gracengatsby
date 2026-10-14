import type { Block } from '@/engine'

import { blockStyleField } from './styleField'

/**
 * A reusable section: a reference to one `reusable-sections` document. The
 * blocks are edited once in that collection and show up everywhere this block
 * points at it (a synced section). Rendered by
 * src/components/blocks/ReusableSectionBlock.tsx.
 */
export const ReusableSectionBlock: Block = {
  slug: 'reusableSection',
  labels: { singular: 'Reusable section', plural: 'Reusable sections' },
  fields: [
    {
      name: 'section',
      type: 'relationship',
      relationTo: 'reusable-sections',
      required: true,
      admin: { description: 'Pick a section from Content > Reusable sections. Editing that section updates every page that uses it.' },
    },
    blockStyleField,
  ],
}