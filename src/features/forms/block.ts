import type { Block } from 'payload'

import { blockStyleField } from '@/blocks/styleField'

import { FORMS_SLUG } from './slugs'

/**
 * The page-builder block that puts a form on a page.
 *
 * Holds a reference and nothing else: wording, spam settings and fields all
 * belong to the form, so that changing a form changes it everywhere it appears
 * rather than in one place and not the others. The two overrides here are the
 * ones that are genuinely per-placement - a heading that suits the page around
 * it, and whether the form's own title is repeated above it.
 */
export const FormBlock: Block = {
  slug: 'form',
  labels: { singular: 'Form', plural: 'Form Blocks' },
  fields: [
    {
      name: 'form',
      type: 'relationship',
      relationTo: FORMS_SLUG,
      required: true,
      admin: { description: 'Build forms under Content > Forms.' },
    },
    {
      name: 'heading',
      type: 'text',
      admin: { description: "Optional. Shown above the form instead of the form's own name." },
    },
    {
      name: 'showTitle',
      type: 'checkbox',
      defaultValue: true,
      admin: { condition: (_, s) => !s?.heading, description: "Show the form's name above it." },
    },
    {
      name: 'intro',
      type: 'textarea',
      admin: { description: 'Optional line of text between the heading and the first field.' },
    },
    blockStyleField,
  ],
}
