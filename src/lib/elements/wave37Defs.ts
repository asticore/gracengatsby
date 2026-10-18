import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 37: a third batch of Elementor-style elements (text ticker, reading progress, content switcher, tooltip,
 * image hotspots, table of contents, sticky bar, coupon code). Same shape as WAVE36_ELEMENTS: each entry is a row
 * value of the generic `element` block. Renderers live in src/components/blocks/elements/Wave37Elements.tsx.
 *
 * Lists are textareas (one row per line, "|" between cells). Icons are written as String.fromCodePoint escapes so
 * this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const check = (name: string, label: string): EditorField => ({ name, label, type: 'checkbox' })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step })
const color = (name = 'color', label = 'Colour'): EditorField => ({ name, label, type: 'color', width: 'half' })

export const WAVE37_ELEMENTS: ElementDef[] = [
  // ---- marketing ----
  {
    type: 'text-ticker', label: 'Text ticker', icon: String.fromCodePoint(0x21e8), category: 'marketing',
    description: 'A line of items that scrolls across the page on a loop. Shown as a plain list when the visitor asks for less motion.',
    fields: [
      area('items', 'Items', 'One item per line.'),
      slider('speed', 'Seconds per loop (5-120, higher is slower)', 5, 120),
      select('direction', 'Direction', opts('left', 'right')),
      check('pauseOnHover', 'Pause when the mouse is over it'),
    ],
    defaultProps: () => ({
      items: 'Free delivery over $50\nNew season arrivals\nHand-poured candles\nGift wrapping available',
      speed: 30, direction: 'left', pauseOnHover: true,
    }),
  },
  {
    type: 'sticky-bar', label: 'Announcement bar', icon: String.fromCodePoint(0x25a4), category: 'marketing', hidden: true,
    description: 'A full-width bar with a message and a button. Inline in the page, or fixed to the top or bottom of the window.',
    fields: [
      text('text', 'Message'),
      text('buttonLabel', 'Button label'),
      { name: 'link', label: 'Button link', type: 'link' },
      select('mode', 'Display', [{ label: 'Inline (in the page flow)', value: 'inline' }, { label: 'Fixed to the window edge', value: 'fixed' }]),
      select('position', 'Edge (when fixed)', opts('top', 'bottom')),
      color('background', 'Background colour'), color('textColor', 'Text colour'), color('buttonColor', 'Button colour'),
    ],
    defaultProps: () => ({
      text: 'Spring sale: 20% off all candles this week.', buttonLabel: 'Shop the sale', link: { url: '/shop' },
      mode: 'inline', position: 'top', background: '#2e3192', textColor: '#ffffff', buttonColor: '#f5a623',
    }),
  },
  {
    type: 'coupon-code', label: 'Coupon code', icon: String.fromCodePoint(0x2702), category: 'marketing',
    description: 'A discount code in a dashed box, ready to copy by hand. Shows the code as text; nothing is applied on the page.',
    fields: [text('label', 'Label'), text('code', 'Code', { helpText: 'Shown exactly as typed. Letters and numbers work best.' }), text('note', 'Note')],
    defaultProps: () => ({ label: 'Your welcome discount', code: 'WELCOME10', note: 'Enter at checkout. Valid on full-price items until the end of the month.' }),
  },
  // ---- layout ----
  {
    type: 'reading-progress', label: 'Reading progress', icon: String.fromCodePoint(0x25ac), category: 'layout', hidden: true,
    description: 'A thin bar fixed to the top or bottom of the window that fills as the visitor scrolls the page. Hidden in browsers without scroll-linked animation, and for visitors who ask for less motion.',
    fields: [slider('height', 'Height (px)', 1, 24), color('color', 'Colour'), select('position', 'Position', opts('top', 'bottom'))],
    defaultProps: () => ({ height: 4, color: '#2e3192', position: 'top' }),
  },
  {
    type: 'toc', label: 'Table of contents', icon: String.fromCodePoint(0x2630), category: 'layout',
    description: 'A list of links to sections of this page. Type each section\'s anchor (the id of its heading) by hand.',
    fields: [
      text('title', 'Title'),
      area('items', 'Entries', 'One entry per line: "label | anchor". The anchor is the id of the heading on this page, without the #. Letters, digits, - and _ only.'),
      select('style', 'Style', opts('numbered', 'bullets')),
      check('sticky', 'Stay in view while scrolling'),
    ],
    defaultProps: () => ({
      title: 'On this page',
      items: 'Introduction | intro\nSizing guide | sizing\nCare instructions | care\nReturns | returns',
      style: 'numbered', sticky: false,
    }),
  },
  // ---- text ----
  {
    type: 'tooltip', label: 'Tooltip', icon: String.fromCodePoint(0x2139), category: 'text',
    description: 'A word or phrase with a short explanation that appears on hover or when focused with the keyboard.',
    fields: [
      text('text', 'Text', { helpText: 'The visible words that carry the tooltip.' }),
      text('tip', 'Tooltip text'),
      select('position', 'Position', opts('top', 'bottom')),
    ],
    defaultProps: () => ({
      text: 'Pure cotton', tip: 'Woven from long-staple cotton for a soft, durable feel.', position: 'top',
    }),
  },
  // ---- interactive ----
  {
    type: 'content-switcher', label: 'Switcher', icon: String.fromCodePoint(0x21c6), category: 'interactive',
    description: 'Two labelled panels of text. The visitor picks one with a tab-style control. Works without JavaScript.',
    fields: [
      text('labelA', 'Label A'), area('contentA', 'Content A', 'One paragraph per line.'),
      text('labelB', 'Label B'), area('contentB', 'Content B', 'One paragraph per line.'),
      select('style', 'Style', opts('pill', 'underline')),
      select('defaultPanel', 'Shown first', [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }]),
      text('uid', 'Element id (optional)', { helpText: 'Leave empty to make one from the text. Set it if two switchers have the same text.' }),
    ],
    defaultProps: () => ({
      labelA: 'Shipping', contentA: 'Orders ship within 2 working days.\nTracked delivery on every order.',
      labelB: 'Returns', contentB: 'Send items back within 28 days.\nRefunds go to your original payment method.',
      style: 'pill', defaultPanel: 'A',
    }),
  },
  // ---- media ----
  {
    type: 'hotspots', label: 'Image hotspots', icon: String.fromCodePoint(0x25ce), category: 'media',
    description: 'A picture with numbered points. Each point opens a short note on hover or keyboard focus.',
    fields: [
      { name: 'image', label: 'Picture', type: 'media' },
      text('alt', 'Alt text', { helpText: 'Describe the picture for people who cannot see it.' }),
      area('items', 'Points', 'One point per line: "x% | y% | title | text". x is the distance from the left edge, y from the top edge.'),
    ],
    defaultProps: () => ({
      alt: 'Product photo',
      items: '25% | 40% | Ceramic mug | Glazed by hand, dishwasher safe.\n70% | 55% | Linen throw | Washed linen, soft from the first wash.\n50% | 20% | Oak tray | Solid oak with a natural finish.',
    }),
  },
]
