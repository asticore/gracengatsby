import type { Block } from 'payload'

export const GalleryBlock: Block = {
  slug: 'gallery',
  labels: { singular: 'Gallery', plural: 'Gallery Blocks' },
  fields: [
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      hasMany: true,
      minRows: 1,
    },
  ],
}
