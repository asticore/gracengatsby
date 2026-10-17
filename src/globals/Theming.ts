import type { GlobalConfig } from '@/engine'
import { isAdmin } from '../access/ecommerceAccess'

export type ColorToken = {
  id: string
  label: string
  value: string
}

export const Theming: GlobalConfig = {
  slug: 'theming',
  dbName: 'eg_theming',
  label: 'Theming',
  admin: {
    group: 'Settings',
    description: 'Global color tokens used throughout the site.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'colors',
      type: 'array',
      label: 'Color tokens',
      minRows: 0,
      fields: [
        {
          name: 'id',
          type: 'text',
          required: true,
          admin: { description: 'Unique identifier for this color (e.g., "color-primary").' },
        },
        {
          name: 'label',
          type: 'text',
          required: true,
          admin: { description: 'Display name (e.g., "Primary Color").' },
        },
        {
          name: 'value',
          type: 'text',
          required: true,
          admin: {
            description: 'Hex color value (e.g., "#ff0000").',
            components: { Field: '@/admin/components/ColorPickerField#ColorPickerField' },
          },
        },
      ],
    },
  ],
}
