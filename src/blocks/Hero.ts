import type { Block } from 'payload'

export const HeroBlock: Block = {
  slug: 'hero',
  labels: { singular: 'Hero', plural: 'Hero Blocks' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      required: true,
    },
    {
      name: 'subheading',
      type: 'textarea',
    },
    {
      name: 'backgroundImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      type: 'row',
      fields: [
        { name: 'primaryCtaLabel', type: 'text', admin: { width: '50%' } },
        { name: 'primaryCtaUrl', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'secondaryCtaLabel', type: 'text', admin: { width: '50%' } },
        { name: 'secondaryCtaUrl', type: 'text', admin: { width: '50%' } },
      ],
    },
  ],
}
