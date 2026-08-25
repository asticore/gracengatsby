import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { pageBuilderBlocks } from '../blocks'

export const FaqSettings: GlobalConfig = {
  slug: 'faq-settings',
  dbName: 'eg_faq_settings',
  label: 'FAQs',
  admin: {
    group: 'Settings',
    description:
      'The standalone /faq knowledge-base page. Turn it on/off in Settings > Features. Click "Edit visually" above to build the intro section on a drag-and-drop canvas.',
    components: {
      elements: {
        beforeDocumentControls: ['@/fields/visualEditor/OpenVisualEditorButton#OpenVisualEditorButton'],
      },
    },
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    { name: 'pageTitle', type: 'text', defaultValue: 'Frequently Asked Questions' },
    { name: 'intro', type: 'textarea' },
    {
      name: 'introBlocks',
      type: 'blocks',
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: pageBuilderBlocks,
      admin: {
        description: 'Shown above the FAQ list on /faq - build it visually with "Edit visually" above.',
        initCollapsed: true,
      },
    },
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
