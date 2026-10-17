import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 38: site elements. Each one reads live site data on the server (site settings, the Header menu, the blog)
 * and renders plain HTML with no client JS. Renderers live in src/components/blocks/elements/Wave38Elements.tsx and
 * are async server components, so they must never render in the editor canvas: CanvasBlockPreview shows a static
 * placeholder for every type in SITE_ELEMENT_TYPES instead.
 *
 * Icons are String.fromCodePoint escapes so this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const check = (name: string, label: string): EditorField => ({ name, label, type: 'checkbox' })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step })

export const WAVE38_ELEMENTS: ElementDef[] = [
  {
    type: 'site-logo', label: 'Site logo', icon: String.fromCodePoint(0x25c9), category: 'siteMeta',
    description: 'The logo from Settings > General, linked to the home page. Shows the site name instead when no logo is set.',
    fields: [
      slider('width', 'Width (px)', 40, 400),
      text('alt', 'Alt text', { helpText: 'Leave empty to use the site name.' }),
    ],
    defaultProps: () => ({ width: 160, alt: '' }),
  },
  {
    type: 'site-title', label: 'Site title', icon: String.fromCodePoint(0x2261), category: 'siteMeta',
    description: 'The site name and tagline from Settings > General. Pick the heading level that suits the page (only one h1 per page).',
    fields: [
      select('tag', 'HTML tag', opts('p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6')),
      check('showTagline', 'Show the tagline under the name'),
    ],
    defaultProps: () => ({ tag: 'p', showTagline: true }),
  },
  {
    type: 'nav-menu', label: 'Menu', icon: String.fromCodePoint(0x25be), category: 'siteMeta',
    description: 'The main menu from Header, with its dropdown items. Dropdowns open on hover or keyboard focus.',
    fields: [
      select('layout', 'Layout', [{ label: 'Horizontal', value: 'horizontal' }, { label: 'Vertical', value: 'vertical' }]),
      text('label', 'Accessible name', { helpText: 'Read out by screen readers, for example "Main menu".' }),
    ],
    defaultProps: () => ({ layout: 'horizontal', label: 'Main menu' }),
  },
  {
    type: 'search-box', label: 'Search box', icon: String.fromCodePoint(0x2315), category: 'siteMeta',
    description: 'A search field that sends the visitor to the site search with ?s=. The site has no search results page yet, so the search itself does nothing until one is added.',
    fields: [
      text('placeholder', 'Placeholder'),
      text('buttonLabel', 'Button label'),
    ],
    defaultProps: () => ({ placeholder: 'Search', buttonLabel: 'Search' }),
  },
  {
    type: 'post-list', label: 'Latest posts', icon: String.fromCodePoint(0x25a6), category: 'siteMeta',
    description: 'The latest published blog posts, newest first (sticky posts first). Shows nothing when the blog is off or there are no posts.',
    fields: [
      slider('count', 'Number of posts (1-12)', 1, 12),
      text('category', 'Category (optional)', { helpText: 'Only posts in this category. Matches the category name, not case sensitive.' }),
      select('layout', 'Layout', opts('grid', 'list')),
      select('headingTag', 'Title heading level', opts('h2', 'h3', 'h4')),
      check('showImage', 'Show the featured image'),
      check('showExcerpt', 'Show the excerpt'),
      check('showDate', 'Show the date'),
    ],
    defaultProps: () => ({ count: 3, category: '', layout: 'grid', headingTag: 'h3', showImage: true, showExcerpt: true, showDate: true }),
  },
]

/** Element types that read live site data on the server. The editor canvas shows a placeholder for these. */
export const SITE_ELEMENT_TYPES: ReadonlySet<string> = new Set(WAVE38_ELEMENTS.map((e) => e.type))
