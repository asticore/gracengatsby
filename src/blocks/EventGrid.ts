import type { Block } from 'payload'

import { blockStyleField } from './styleField'

export const EventGridBlock: Block = {
  slug: 'eventGrid',
  labels: { singular: 'Event Grid', plural: 'Event Grid Blocks' },
  fields: [
    {
      name: 'heading',
      type: 'text',
    },
    {
      name: 'showPast',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Show recent past events instead of upcoming ones.' },
    },
    {
      name: 'limit',
      type: 'number',
      defaultValue: 3,
      min: 1,
      max: 24,
    },
    blockStyleField,
  ],
}
