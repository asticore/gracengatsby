import type { ElementDef } from './registry'

/**
 * Wave 63: template widgets. Server-rendered from the per-request block context (src/lib/blockContext.ts), so they
 * fill in on single post, product and page templates. Renderers: src/components/blocks/elements/Wave63Server.tsx.
 * Related items: use the Loop element with "Related" ticked instead.
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))

export const WAVE63_ELEMENTS: ElementDef[] = [
  {
    type: 'post-title', label: 'Post title', icon: String.fromCodePoint(0x1f4dd), category: 'siteMeta',
    description: 'The title of the post, product or page being viewed.',
    fields: [{ name: 'level', label: 'Heading level', type: 'select', width: 'half', options: labelled([['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6']]) }],
    defaultProps: () => ({ level: 'h1' }),
  },
  {
    type: 'post-featured-image', label: 'Post featured image', icon: String.fromCodePoint(0x1f5bc), category: 'siteMeta',
    description: 'The featured picture of the post being viewed.',
    fields: [],
    defaultProps: () => ({}),
  },
  {
    type: 'post-excerpt', label: 'Post excerpt', icon: String.fromCodePoint(0x1f4c4), category: 'siteMeta',
    description: 'The short summary of the post being viewed.',
    fields: [],
    defaultProps: () => ({}),
  },
  {
    type: 'post-meta', label: 'Post meta', icon: String.fromCodePoint(0x1f3f7), category: 'siteMeta',
    description: 'Author, date and categories of the post being viewed.',
    fields: [
      { name: 'showAuthor', label: 'Show author', type: 'checkbox' },
      { name: 'showDate', label: 'Show date', type: 'checkbox' },
      { name: 'showCategories', label: 'Show categories', type: 'checkbox' },
      { name: 'format', label: 'Date style', type: 'select', width: 'half', options: labelled([['short', 'Short (20/10/2026)'], ['long', 'Long (20 October 2026)']]) },
    ],
    defaultProps: () => ({ showAuthor: true, showDate: true, showCategories: true, format: 'long' }),
  },
  {
    type: 'product-price', label: 'Product price', icon: String.fromCodePoint(0x1f4b2), category: 'siteMeta',
    description: 'The price of the product being viewed.',
    fields: [],
    defaultProps: () => ({}),
  },
  {
    type: 'auto-breadcrumbs', label: 'Auto breadcrumbs', icon: String.fromCodePoint(0x1f9ed), category: 'siteMeta',
    description: 'Home > section > current page trail, built from the page address.',
    fields: [{ name: 'homeLabel', label: 'Home label', type: 'text', width: 'half' }],
    defaultProps: () => ({ homeLabel: 'Home' }),
  },
]
