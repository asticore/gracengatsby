import type { Block } from '@/engine'

import { blockStyleField } from './styleField'
import { lexicalEditor } from '@/engine/editor'

export const RichTextBlock: Block = {
  slug: 'richText',
  labels: { singular: 'Rich Text', plural: 'Rich Text Blocks' },
  fields: [
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor(),
      required: true,
    },
    blockStyleField,
  ],
}
