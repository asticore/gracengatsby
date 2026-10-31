import type { ElementDef } from './registry'

/**
 * Template part: draws any site template (header, footer, sidebar or a hand-built one) inside a page, a template or
 * a reusable section. Server rendered (SITE_ELEMENT_TYPES); renderer: src/components/blocks/elements/TemplatePartServer.tsx.
 */
export const TEMPLATE_PART_ELEMENTS: ElementDef[] = [
  {
    type: 'template-part',
    label: 'Template part',
    icon: '🧩',
    category: 'layout',
    description: 'Places a site template here: a header, footer, sidebar or any section you built in the visual editor. Change the template in one place and every place that uses it changes.',
    fields: [
      {
        name: 'templateId',
        label: 'Template id',
        type: 'number',
        width: 'half',
        helpText: 'The number in the template\'s edit address (Templates > the template > "/site-templates/<number>"). Turned-off templates draw nothing here. Parts cannot hold other parts.',
      },
    ],
    defaultProps: () => ({ templateId: undefined }),
  },
]
