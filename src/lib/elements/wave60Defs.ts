import type { ElementDef } from './registry'

/**
 * Wave 60: the Dynamic text element. Text with {{post.title}} style tags filled from the page being viewed.
 * Renderer: src/components/blocks/elements/DynamicText.tsx. Tag logic: src/lib/dynamicTags.ts.
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))

export const WAVE60_ELEMENTS: ElementDef[] = [
  {
    type: 'dynamic-text', label: 'Dynamic text', icon: String.fromCodePoint(0x1f9e9), category: 'siteMeta',
    description: 'Text that fills in details from the page: post title, date, author, site name, product price and more.',
    fields: [
      { name: 'template', label: 'Text', type: 'textarea', helpText: 'Tags: {{post.title}} {{post.date}} {{post.excerpt}} {{post.author}} {{page.title}} {{site.name}} {{site.year}} {{product.title}} {{product.price}}' },
      { name: 'tag', label: 'Shown as', type: 'select', width: 'half', options: labelled([['p', 'Paragraph'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['span', 'Inline text']]) },
      { name: 'format', label: 'Date style', type: 'select', width: 'half', options: labelled([['short', 'Short (20/10/2026)'], ['long', 'Long (20 October 2026)']]) },
    ],
    defaultProps: () => ({ template: 'Copyright {{site.year}} {{site.name}}', tag: 'p', format: 'long' }),
  },
]
