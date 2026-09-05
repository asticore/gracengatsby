import type { Block } from '@/engine'

import { blockStyleField } from './styleField'
import { lexicalEditor } from '@/engine/editor'

export const ImageTextBlock: Block = {
  slug: 'imageText',
  labels: { singular: 'Image + Text', plural: 'Image + Text Blocks' },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'content',
      type: 'richText',
      editor: lexicalEditor(),
      required: true,
    },
    {
      name: 'imageSide',
      type: 'select',
      defaultValue: 'left',
      options: [
        { label: 'Image on left', value: 'left' },
        { label: 'Image on right', value: 'right' },
      ],
    },
    blockStyleField,
  ],
}
