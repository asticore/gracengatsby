import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Loop grid and archive Filter widgets. Server-rendered: the Loop grid draws a `loop` site template once per item
 * (src/features/siteTemplates/loopGrid.ts), the Filter widget writes the archive filter params
 * (src/features/siteTemplates/archiveFilter.ts). Renderers: src/components/blocks/elements/LoopGridServer.tsx and
 * ArchiveFilter.tsx, registered in Wave38Elements.tsx.
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const check = (name: string, label: string, defaultHelp?: string, showIf?: EditorField['showIf']): EditorField => ({ name, label, type: 'checkbox', helpText: defaultHelp, showIf })

export const LOOP_GRID_ELEMENTS: ElementDef[] = [
  {
    type: 'loop-grid', label: 'Loop grid', icon: String.fromCodePoint(0x1f9e9), category: 'siteMeta',
    description: 'Draws a loop template (a card built from dynamic widgets) once per item: the items of the archive being viewed, or posts, products or events you pick.',
    fields: [
      { name: 'loopTemplate', label: 'Loop template', type: 'select', width: 'full', optionsUrl: '/api/admin-loop-templates', options: [], helpText: 'Enabled templates of type Loop item (Templates).' },
      {
        name: 'source', label: 'Show', type: 'select', width: 'half',
        options: labelled([['', 'Items of the current archive'], ['posts', 'Blog posts'], ['products', 'Products'], ['events', 'Events']]),
        helpText: 'Leave on the current archive inside an archive template.',
      },
      { name: 'category', label: 'Only this category', type: 'text', width: 'half', helpText: 'Category name (posts, products) or event type (events).' },
      { name: 'tag', label: 'Only this tag', type: 'text', width: 'half', showIf: { field: 'source', in: ['', 'posts'] } },
      { name: 'author', label: 'Only this author', type: 'text', width: 'half', showIf: { field: 'source', in: ['', 'posts'] } },
      { name: 'type', label: 'Product or event type', type: 'text', width: 'half', helpText: 'For example simple or gift card (products). Leave empty for all.' },
      {
        name: 'orderBy', label: 'Order by', type: 'select', width: 'half',
        options: labelled([['newest', 'Newest'], ['oldest', 'Oldest'], ['title', 'Title A to Z'], ['price-asc', 'Price low to high'], ['price-desc', 'Price high to low']]),
      },
      { name: 'count', label: 'Items per page (1-48)', type: 'range', width: 'half', min: 1, max: 48, step: 1 },
      { name: 'columns', label: 'Columns (1-4)', type: 'range', width: 'half', min: 1, max: 4, step: 1 },
      check('pagination', 'Numbered pages', 'For a fixed source. Inside an archive the archive pager is used.'),
      check('linkCards', 'Make each card a link', 'Turn off when the loop template already has its own links.'),
    ],
    defaultProps: () => ({ loopTemplate: '', source: '', category: '', tag: '', author: '', type: '', orderBy: 'newest', count: 9, columns: 3, pagination: false, linkCards: true }),
  },
  {
    type: 'archive-filter', label: 'Archive filter', icon: String.fromCodePoint(0x1f50e), category: 'siteMeta',
    description: 'A filter form for archive pages: search, category, tag, price range and sort. Works on the blog and shop archives and drives the Loop grid on the same page.',
    fields: [
      check('showSearch', 'Show search box'),
      check('showCategory', 'Show category'),
      check('showTag', 'Show tag', 'Blog only, when posts have tags.'),
      check('showPrice', 'Show price range', 'Shop only.'),
      check('showSort', 'Show sort'),
    ],
    defaultProps: () => ({ showSearch: true, showCategory: true, showTag: true, showPrice: true, showSort: true }),
  },
]
