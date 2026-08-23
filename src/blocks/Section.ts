import type { Block } from 'payload'

import { blockStyleField } from './styleField'

/**
 * A layout container: one row of columns, each holding its own stack of blocks.
 *
 * The column tree is stored as a single JSON column rather than as nested
 * Payload `blocks` fields. Two reasons:
 *
 *  1. Nesting real blocks-in-arrays-in-blocks would create a child table per
 *     (surface x nesting level x block type) - roughly 160 new D1 tables for
 *     one level of nesting, and a further multiple for each level after that.
 *  2. JSON nests arbitrarily, so a section can contain a section can contain a
 *     section, which is what actually delivers Elementor-style layout. A fixed
 *     Payload schema can only ever express a fixed nesting depth.
 *
 * The shape is defined and parsed in src/lib/sectionTree.ts, rendered by
 * src/components/blocks/SectionBlock.tsx, and edited on the visual canvas.
 */
export const SectionBlock: Block = {
  slug: 'section',
  labels: { singular: 'Section', plural: 'Sections' },
  fields: [
    {
      name: 'columns',
      type: 'json',
      label: 'Columns',
      admin: {
        description:
          'The columns in this section and the blocks inside each one. Build this on the drag-and-drop canvas via "Edit visually" - this raw view is an escape hatch.',
      },
    },
    blockStyleField,
  ],
}
