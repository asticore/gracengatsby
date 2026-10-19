import type { EditorField, ShowIf } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 50: the Loop element. A query element: it lists published posts, products, events, FAQs or pages from the
 * site database, as cards in a grid, a list or a scrolling row. Rendered on the server.
 *
 * Renderer: src/components/blocks/elements/Wave50Elements.tsx (pure view) and Wave50Server.tsx (async data
 * wrapper, uses the same engine and merge-context layer as the Loop section block). Styles: wave50.css.
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const slider = (name: string, label: string, min: number, max: number, step = 1, helpText?: string): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step, helpText })
const check = (name: string, label: string, helpText?: string, showIf?: ShowIf): EditorField => ({ name, label, type: 'checkbox', helpText, showIf })

export const WAVE50_ELEMENTS: ElementDef[] = [
  {
    type: 'loop', label: 'Loop', icon: String.fromCodePoint(0x1f501), category: 'siteMeta',
    description: 'A live list of your posts, products, events, FAQs or pages, as cards in a grid, a list or a scrolling row.',
    fields: [
      select('source', 'Show', labelled([['posts', 'Blog posts'], ['products', 'Products'], ['events', 'Events'], ['faqs', 'FAQs'], ['pages', 'Pages']])),
      slider('count', 'How many (1-24)', 1, 24),
      select('orderBy', 'Sort by', labelled([['date', 'Date'], ['title', 'Title'], ['menu order', 'Menu order'], ['random-stable', 'Random (same for everyone)']])),
      select('order', 'Order', labelled([['desc', 'Newest or Z-A first'], ['asc', 'Oldest or A-Z first']])),
      { name: 'category', label: 'Only this category', type: 'text', helpText: 'Category name for posts, products and FAQs, event type for events. Leave empty for all.' },
      check('related', 'Related: leave out the page being viewed', 'Use on a post, product or event page to list the others.'),
      select('layout', 'Layout', labelled([['grid', 'Grid'], ['list', 'List'], ['carousel', 'Carousel']])),
      slider('columns', 'Columns (1-6)', 1, 6, 1, 'Grid and carousel.'),
      check('showImage', 'Show picture'),
      check('showExcerpt', 'Show excerpt'),
      check('showDate', 'Show date', 'Posts and events.'),
      check('showPrice', 'Show price', 'Products.'),
      { name: 'emptyText', label: 'Text when nothing matches', type: 'text' },
      check('loadMore', 'Next page link', 'A plain link to ?page=2 and so on.'),
      check('pagination', 'Numbered page links'),
    ],
    defaultProps: () => ({
      source: 'posts', count: 6, orderBy: 'date', order: 'desc', category: '', related: false, layout: 'grid', columns: 3,
      showImage: true, showExcerpt: true, showDate: true, showPrice: true, emptyText: 'Nothing to show yet.', loadMore: false, pagination: false,
    }),
  },
]
