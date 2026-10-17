import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 43: six text and marketing effects (gradient text, split text, highlight text, outline text, count-up,
 * draw line) and a bento grid. Same shape as WAVE36_ELEMENTS: each entry is a row value of the generic `element`
 * block. Renderers live in src/components/blocks/elements/Wave43Elements.tsx and motion in wave43.css.
 *
 * Icons are written as String.fromCodePoint escapes so this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const check = (name: string, label: string): EditorField => ({ name, label, type: 'checkbox' })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1, helpText?: string): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step, helpText })
const color = (name = 'color', label = 'Colour'): EditorField => ({ name, label, type: 'color', width: 'half' })
const tagField = (options: string[], fallback: string): EditorField =>
  select('tag', 'HTML tag', options.map((v) => ({ label: v.toUpperCase(), value: v })), { helpText: `Semantic element (${fallback} by default). Visual size is set by the font size fields.` })

const TEXT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span']

export const WAVE43_ELEMENTS: ElementDef[] = [
  // ---- text ----
  {
    type: 'gradient-text', label: 'Gradient text', icon: String.fromCodePoint(0x1f308), category: 'text',
    description: 'Text filled with a colour gradient of two or three colours. Can drift slowly with motion turned on.',
    fields: [
      text('text', 'Text'), tagField(TEXT_TAGS, 'h2'),
      color('color1', 'Colour 1'), color('color2', 'Colour 2'), color('color3', 'Colour 3 (optional)'),
      slider('angle', 'Angle (degrees)', 0, 360, 15), check('animated', 'Animate the colours (slow drift)'),
      slider('sizeMin', 'Smallest font size (px)', 10, 200, 1, 'Used on small screens.'),
      slider('sizeMax', 'Largest font size (px)', 10, 300, 1, 'Reached on screens 1600px wide and up. Sizes scale in between.'),
    ],
    defaultProps: () => ({
      text: 'Gradient headline', tag: 'h2', color1: '#2e3192', color2: '#00a9ff', color3: '#f5a623',
      angle: 90, animated: false, sizeMin: 32, sizeMax: 56,
    }),
  },
  {
    type: 'split-text', label: 'Split text reveal', icon: String.fromCodePoint(0x2592), category: 'text',
    description: 'Text that reveals word by word or letter by letter as it scrolls into view. Up to 200 letters animate; the rest shows at once.',
    fields: [
      text('text', 'Text'),
      select('by', 'Split by', opts('word', 'letter')),
      select('effect', 'Effect', opts('fade-up', 'blur', 'slide')),
      slider('stagger', 'Delay between pieces (ms)', 0, 500, 10),
      tagField(TEXT_TAGS, 'h2'),
    ],
    defaultProps: () => ({ text: 'Words that rise into place', by: 'word', effect: 'fade-up', stagger: 80, tag: 'h2' }),
  },
  {
    type: 'highlight-text', label: 'Highlighted text', icon: String.fromCodePoint(0x1f58d), category: 'text',
    description: 'A sentence with one phrase marked by an underline, wave, box or circle that draws itself in.',
    fields: [
      text('before', 'Text before'), text('phrase', 'Highlighted phrase'), text('after', 'Text after'),
      tagField(TEXT_TAGS, 'p'),
      select('style', 'Marker', opts('underline', 'underline-wavy', 'box', 'circle')),
      color('color', 'Marker colour'),
      select('trigger', 'Draw the marker', [{ label: 'When the page loads', value: 'load' }, { label: 'When scrolled into view', value: 'view' }]),
    ],
    defaultProps: () => ({
      before: 'Our work is', phrase: 'hand made', after: 'in small batches',
      tag: 'p', style: 'underline', color: '#f5a623', trigger: 'view',
    }),
  },
  {
    type: 'outline-text', label: 'Outline text', icon: String.fromCodePoint(0x25cb), category: 'text',
    description: 'Big outlined text with no fill. Optionally fills in when the visitor hovers over it.',
    fields: [
      text('text', 'Text'), tagField(TEXT_TAGS, 'h2'),
      slider('size', 'Font size (px)', 16, 300, 1), slider('stroke', 'Outline width (px)', 0.5, 12, 0.5),
      color('color', 'Outline colour'),
      check('fillOnHover', 'Fill in on hover'), color('fillColor', 'Fill colour on hover'),
      check('clip', 'Clip at the edge instead of wrapping'),
    ],
    defaultProps: () => ({
      text: 'BIG IDEAS', tag: 'h2', size: 160, stroke: 2, color: '#2e3192',
      fillOnHover: true, fillColor: '#00a9ff', clip: false,
    }),
  },
  // ---- marketing ----
  {
    type: 'count-up', label: 'Count up', icon: String.fromCodePoint(0x1f522), category: 'marketing',
    description: 'A number that counts up from a start value to an end value when the page loads. Screen readers hear the final number.',
    fields: [
      { name: 'start', label: 'Start number', type: 'number', width: 'half' },
      { name: 'end', label: 'End number', type: 'number', width: 'half' },
      text('prefix', 'Prefix (e.g. $)', { width: 'half' }), text('suffix', 'Suffix (e.g. +)', { width: 'half' }),
      slider('duration', 'Duration (ms)', 200, 5000, 100),
      select('decimals', 'Decimal places', [{ label: '0', value: '0' }, { label: '1', value: '1' }, { label: '2', value: '2' }]),
      text('label', 'Label below'),
    ],
    defaultProps: () => ({ start: 0, end: 1250, prefix: '', suffix: '+', duration: 1600, decimals: '0', label: 'Happy customers' }),
  },
  // ---- media ----
  {
    type: 'draw-line', label: 'Drawn line', icon: String.fromCodePoint(0x3030), category: 'media',
    description: 'A decorative line shape that draws itself as it scrolls into view. Purely decorative: hidden from screen readers.',
    fields: [
      select('shape', 'Shape', opts('wave', 'zigzag', 'loop', 'underline', 'arrow')),
      color('color', 'Line colour'),
      slider('strokeWidth', 'Line width', 1, 20, 1),
    ],
    defaultProps: () => ({ shape: 'wave', color: '#2e3192', strokeWidth: 4 }),
  },
  // ---- layout ----
  {
    type: 'bento-grid', label: 'Bento grid', icon: String.fromCodePoint(0x25a6), category: 'layout',
    description: 'A grid of tiles of mixed sizes, each with a title, text and an optional link. Stacks to one column on phones.',
    fields: [
      {
        name: 'tiles', label: 'Tiles', type: 'repeater',
        repeater: {
          fields: [
            text('title', 'Title'), area('text', 'Text'),
            text('href', 'Link address', { helpText: 'Optional. Whole tile links to this address (a page on this site or https://...).' }),
            select('colspan', 'Width (columns)', [{ label: '1', value: '1' }, { label: '2', value: '2' }]),
            select('rowspan', 'Height (rows)', [{ label: '1', value: '1' }, { label: '2', value: '2' }]),
            color('background', 'Background colour'),
          ],
        },
      },
    ],
    defaultProps: () => ({
      tiles: [
        { title: 'Hand-dyed yarn', text: 'Small batches, dyed in the studio.', href: '/shop', colspan: '2', rowspan: '2', background: '#f4e3c1' },
        { title: 'Classes', text: 'Learn at the table with us.', href: '/classes', colspan: '1', rowspan: '1', background: '#cfe8f3' },
        { title: 'Our story', text: 'How it started, and who we are now.', href: '/about', colspan: '1', rowspan: '1', background: '#e8dcf5' },
        { title: 'Gift cards', text: 'Easy for any occasion.', href: '/gift-cards', colspan: '2', rowspan: '1', background: '#2e3192' },
        { title: 'Visit us', text: 'Opening hours and directions.', href: '/contact', colspan: '1', rowspan: '1', background: '#f5f0e6' },
        { title: 'Newsletter', text: 'New stock, once a month.', href: '', colspan: '1', rowspan: '1', background: '#ffe6e0' },
      ],
    }),
  },
]
