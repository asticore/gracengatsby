import type { Block } from 'payload'

export const CtaBannerBlock: Block = {
  slug: 'ctaBanner',
  labels: { singular: 'CTA Banner', plural: 'CTA Banner Blocks' },
  fields: [
    {
      name: 'heading',
      type: 'text',
      required: true,
    },
    {
      name: 'text',
      type: 'textarea',
    },
    {
      type: 'row',
      fields: [
        { name: 'buttonLabel', type: 'text', admin: { width: '50%' } },
        { name: 'buttonUrl', type: 'text', admin: { width: '50%' } },
      ],
    },
    {
      name: 'style',
      type: 'select',
      defaultValue: 'dark',
      options: [
        { label: 'Dark background', value: 'dark' },
        { label: 'Light background', value: 'light' },
      ],
    },
  ],
}
