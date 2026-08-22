import type { Block } from 'payload'

export const FaqBlock: Block = {
  slug: 'faq',
  labels: { singular: 'FAQ', plural: 'FAQ Blocks' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'Frequently asked questions' },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'category',
      options: [
        { label: 'All FAQs in a category', value: 'category' },
        { label: 'Hand-pick specific FAQs', value: 'manual' },
      ],
    },
    {
      name: 'category',
      type: 'text',
      admin: {
        description: 'Matches the Category field on the FAQ entries. Leave blank to show all FAQs.',
        condition: (_, s) => s?.source !== 'manual',
      },
    },
    {
      name: 'faqs',
      type: 'relationship',
      relationTo: 'faqs',
      hasMany: true,
      admin: { condition: (_, s) => s?.source === 'manual' },
    },
  ],
}
