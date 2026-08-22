import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

export const FaqSettings: GlobalConfig = {
  slug: 'faq-settings',
  admin: {
    group: 'Content',
    description: 'The standalone /faq knowledge-base page. Turn it on/off in Settings > Features.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'pageTitle', type: 'text', defaultValue: 'Frequently Asked Questions' },
    { name: 'intro', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'layout',
          type: 'select',
          defaultValue: 'accordion',
          admin: { width: '50%' },
          options: [
            { label: 'Accordion', value: 'accordion' },
            { label: 'Plain list', value: 'list' },
          ],
        },
        { name: 'groupByCategory', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
      ],
    },
  ],
}
