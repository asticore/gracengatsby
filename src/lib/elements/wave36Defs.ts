import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 36: a second batch of Elementor-style elements (table, timeline, breadcrumbs, headings, charts, share,
 * back-to-top, image comparison). Same shape as WAVE26_ELEMENTS: each entry is a row value of the generic
 * `element` block. Renderers live in src/components/blocks/elements/Wave36Elements.tsx.
 *
 * Lists are textareas (one row per line, "|" between cells) because the panel has no repeater that holds
 * more than a label and a value. Icons are written as String.fromCodePoint escapes so this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const ALIGN: EditorField = { name: 'align', label: 'Alignment', type: 'select', width: 'half', options: opts('left', 'center', 'right') }
const ALIGN_LR: EditorField = { name: 'align', label: 'Alignment', type: 'select', width: 'half', options: opts('left', 'center') }
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const check = (name: string, label: string): EditorField => ({ name, label, type: 'checkbox' })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step })
const color = (name = 'color', label = 'Colour'): EditorField => ({ name, label, type: 'color', width: 'half' })
const icon = (name = 'icon'): EditorField => ({ name, label: 'Icon', type: 'icon', iconSet: 'builtin' })
const headingTag = (name = 'tag', options = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']): EditorField => select(name, 'HTML tag', options.map((v) => ({ label: v.toUpperCase(), value: v })), { helpText: 'Semantic heading level. Visual size is set on the Style tab.' })

export const WAVE36_ELEMENTS: ElementDef[] = [
  // ---- text ----
  {
    type: 'table', label: 'Table', icon: String.fromCodePoint(0x25a5), category: 'text',
    description: 'A data table with an optional header row, stripes and caption. Scrolls sideways on small screens.',
    fields: [
      area('rows', 'Rows', 'One row per line, cells separated by "|". Up to 6 columns.'),
      check('headerRow', 'First row is a header'), check('striped', 'Striped rows'), text('caption', 'Caption'),
    ],
    defaultProps: () => ({
      rows: 'Day | Hours\nMonday to Friday | 9am to 5pm\nSaturday | 10am to 2pm\nSunday | Closed',
      headerRow: true, striped: true, caption: 'Opening hours',
    }),
  },
  {
    type: 'dual-heading', label: 'Two-tone heading', icon: String.fromCodePoint(0x1f524), category: 'text', hidden: true,
    description: 'One heading where the second part is in another colour.',
    fields: [text('first', 'First part'), text('second', 'Second part (coloured)'), headingTag(), color(), ALIGN],
    defaultProps: () => ({ first: 'Crafted', second: 'by hand', tag: 'h2', color: '#2e3192', align: 'left' }),
  },
  {
    type: 'animated-headline', label: 'Rotating headline', icon: String.fromCodePoint(0x1f501), category: 'text', hidden: true,
    description: 'A heading where one word after another rotates in the same place. Still reads as plain text to search engines and screen readers.',
    fields: [
      text('before', 'Text before'), area('words', 'Words', 'One word or phrase per line.'), text('after', 'Text after'),
      headingTag(), select('style', 'Animation', opts('fade', 'slide')),
    ],
    defaultProps: () => ({ before: 'We build', words: 'websites\nbrands\nexperiences', after: 'that last', tag: 'h1', style: 'fade' }),
  },
  // ---- layout ----
  {
    type: 'timeline', label: 'Timeline', icon: String.fromCodePoint(0x1f4c6), category: 'layout', hidden: true,
    description: 'A vertical list of dated events with a line running down the side.',
    fields: [
      { name: 'items', label: 'Events', type: 'repeater', repeater: { fields: [text('date', 'Date (e.g. 2019 or 2019-06-01)'), text('title', 'Title'), area('text', 'Text')] } },
      headingTag('tag', ['h2', 'h3', 'h4']), ALIGN_LR,
    ],
    defaultProps: () => ({
      items: [
        { date: '2019', title: 'Founded', text: 'Started in a spare room with two people.' },
        { date: '2021', title: 'First shop open', text: 'Moved to a shop on the high street.' },
        { date: '2024', title: 'Online store launched', text: 'Orders now ship across the country.' },
      ],
      tag: 'h3', align: 'left',
    }),
  },
  {
    type: 'breadcrumbs', label: 'Breadcrumbs', icon: String.fromCodePoint(0x203a), category: 'layout',
    description: 'A trail showing where the page sits on the site. Adds BreadcrumbList structured data for search engines.',
    fields: [
      { name: 'items', label: 'Trail', type: 'repeater', repeater: { fields: [text('label', 'Label'), text('url', 'Address', { helpText: 'Full address (https://...) helps search engines. Leave empty on the current page.' })] } },
      select('separator', 'Separator', [{ label: '/', value: '/' }, { label: '>', value: '>' }, { label: '-', value: '-' }]),
    ],
    defaultProps: () => ({
      items: [{ label: 'Home', url: '/' }, { label: 'Shop', url: '/shop' }, { label: 'Candles', url: '' }],
      separator: '/',
    }),
  },
  {
    hidden: true, type: 'back-to-top', label: 'Back to top', icon: String.fromCodePoint(0x2191), category: 'layout',
    description: 'A button that jumps to the top of the page. Needs an element with the id "top" (for example the page top anchor).',
    fields: [
      text('label', 'Label'), icon(), select('position', 'Position', opts('inline', 'fixed-corner')), ALIGN_LR,
    ],
    defaultProps: () => ({ label: 'Back to top', icon: 'arrow', position: 'inline', align: 'center' }),
  },
  // ---- interactive ----
  {
    type: 'circle-progress', label: 'Circle progress', icon: String.fromCodePoint(0x25d4), category: 'interactive', hidden: true,
    description: 'A ring that fills to a percentage, with the number in the middle.',
    fields: [
      slider('percent', 'Percent (0-100)', 0, 100), text('label', 'Label'), slider('size', 'Size (px)', 60, 300, 4),
      slider('thickness', 'Thickness (px)', 2, 40), color(),
    ],
    defaultProps: () => ({ percent: 72, label: 'Complete', size: 160, thickness: 12, color: '#2e3192' }),
  },
  {
    hidden: true, type: 'bar-chart', label: 'Bar chart', icon: String.fromCodePoint(0x2587), category: 'interactive',
    description: 'A bar chart of up to 12 values. The same data is available to screen readers as a table.',
    fields: [
      text('title', 'Title'), area('data', 'Data', 'One row per line: "label | value".'),
      text('colors', 'Bar colours', { helpText: 'Comma-separated, reused in turn. e.g. #2e3192, #00a9ff' }),
      check('showValues', 'Show the values above the bars'),
    ],
    defaultProps: () => ({
      title: 'Sales by month',
      data: 'Jan | 120\nFeb | 95\nMar | 160\nApr | 140',
      colors: '#2e3192, #00a9ff, #f5a623, #2ecc71, #e74c3c',
      showValues: true,
    }),
  },
  {
    hidden: true, type: 'pie-chart', label: 'Pie chart', icon: String.fromCodePoint(0x25d5), category: 'interactive',
    description: 'A pie chart of up to 12 values, with a legend. The same data is available to screen readers as a table.',
    fields: [
      text('title', 'Title'), area('data', 'Data', 'One row per line: "label | value".'),
      text('colors', 'Slice colours', { helpText: 'Comma-separated, reused in turn. e.g. #2e3192, #00a9ff' }),
    ],
    defaultProps: () => ({
      title: 'Where our visitors come from',
      data: 'Search | 45\nSocial | 30\nEmail | 15\nDirect | 10',
      colors: '#2e3192, #00a9ff, #f5a623, #2ecc71, #e74c3c',
    }),
  },
  {
    type: 'share-buttons', label: 'Share buttons', icon: String.fromCodePoint(0x2197), category: 'interactive', hidden: true,
    description: 'Links that open the share dialog of each network you tick.',
    fields: [
      text('title', 'Title to share', { helpText: 'Used as the message text.' }),
      text('shareUrl', 'Address to share', { helpText: 'Full address of the page (https://...). Leave empty to share the title only.' }),
      check('facebook', 'Facebook'), check('x', 'X (Twitter)'), check('linkedin', 'LinkedIn'), check('whatsapp', 'WhatsApp'), check('email', 'Email'),
      select('style', 'Style', opts('buttons', 'icons')), ALIGN,
    ],
    defaultProps: () => ({ title: 'Check this out', shareUrl: '', facebook: true, x: true, linkedin: true, whatsapp: true, email: true, style: 'buttons', align: 'left' }),
  },
  // ---- media ----
  {
    type: 'image-comparison', label: 'Before and after', icon: String.fromCodePoint(0x25e7), category: 'media',
    description: 'Two pictures on top of each other. Drag the right edge of the first picture to compare them.',
    fields: [
      { name: 'before', label: 'Before picture', type: 'media' }, text('beforeUrl', 'Or before picture address'), text('beforeAlt', 'Before alt text'),
      { name: 'after', label: 'After picture', type: 'media' }, text('afterUrl', 'Or after picture address'), text('afterAlt', 'After alt text'),
      text('beforeLabel', 'Before label', { width: 'half' }), text('afterLabel', 'After label', { width: 'half' }),
      select('ratio', 'Shape', [{ label: '16:9', value: '16:9' }, { label: '4:3', value: '4:3' }, { label: '1:1', value: '1:1' }, { label: '3:2', value: '3:2' }]),
    ],
    defaultProps: () => ({ beforeAlt: 'Before', afterAlt: 'After', beforeLabel: 'Before', afterLabel: 'After', ratio: '16:9' }),
  },
]
