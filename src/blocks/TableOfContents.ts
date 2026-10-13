import type { Block } from '@/engine'

import { blockStyleField } from './styleField'

/**
 * A list of links to the page's own headings. It is filled in when the page
 * renders (see src/features/editScreens/toc.ts), so nothing is stored for the
 * list itself.
 */
export const TableOfContentsBlock: Block = {
  slug: 'toc',
  labels: { singular: 'Table of contents', plural: 'Table of contents blocks' },
  fields: [
    {
      name: 'title',
      type: 'text',
      defaultValue: 'On this page',
      admin: { description: 'The heading above the list. Leave empty for no heading.' },
    },
    {
      name: 'levels',
      type: 'select',
      defaultValue: 'h2-h4',
      admin: { description: 'Which headings to list. Headings are taken from the rich text on this page.' },
      options: [
        { label: 'Main headings only (H2)', value: 'h2' },
        { label: 'Main and sub headings (H2 and H3)', value: 'h2-h3' },
        { label: 'All headings (H2 to H4)', value: 'h2-h4' },
      ],
    },
    {
      name: 'collapsible',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Readers can open and close the list. Useful on small screens.' },
    },
    blockStyleField,
  ],
}