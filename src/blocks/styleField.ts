import type { Field } from 'payload'

/**
 * The per-block "Design" settings, stored as one JSON column.
 *
 * Every page-builder block gets this appended (see `withBlockStyle` below).
 * It is JSON rather than ~25 discrete Payload fields on purpose: as discrete
 * fields it would add twenty-five columns to every block table across Pages,
 * Posts, Products, Page Templates and the three settings globals - plus each
 * of their draft-version twins - for settings that are meant to be edited on
 * the visual canvas anyway. The shape is defined and validated in
 * src/lib/blockStyle.ts.
 */
// Named `design`, not `style`, because the CTA Banner block already has its
// own `style` select (dark/light) and renaming that would orphan existing data.
export const blockStyleField: Field = {
  name: 'design',
  type: 'json',
  label: 'Design',
  admin: {
    description:
      'Background, spacing, alignment, shape dividers and responsive visibility for this section. Set these on the drag-and-drop canvas via "Edit visually" - this raw view is here as an escape hatch.',
  },
}

/** Appends the shared Design settings to a block's own fields. */
export function withBlockStyle(fields: Field[]): Field[] {
  return [...fields, blockStyleField]
}
