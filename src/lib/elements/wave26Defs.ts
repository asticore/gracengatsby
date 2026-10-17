import { ICON_OPTIONS, SOCIAL_NETWORKS } from '@/components/blocks/elements/icons'
import { RATIO_OPTIONS } from '@/components/blocks/elements/elementUtil'

import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 26: the Elementor-style element catalogue. Every entry is a row value of the generic `element` block (no
 * schema cost). The panel has no repeater field, so lists are a textarea with one item per line and "|" between the
 * cells; the renderers (src/components/blocks/elements) parse them.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const ALIGN: EditorField = { name: 'align', label: 'Alignment', type: 'select', width: 'half', options: opts('left', 'center', 'right') }
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
const number = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'number', width: 'half', helpText })
const icon = (name = 'icon'): EditorField => select(name, 'Icon', ICON_OPTIONS)
const link = (name = 'link', label = 'Link (optional)'): EditorField => text(name, label)
const urlLines: EditorField = area('urls', 'Or image addresses', 'One per line: "https://... | alt text". Added after the pictures chosen above.')

const paragraph = (value: string) => ({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text: value, format: 0, style: '', mode: 'normal', detail: 0 }] }],
  },
})

export const WAVE26_ELEMENTS: ElementDef[] = [
  // ---- text ----
  {
    type: 'text-editor', label: 'Text editor', icon: '¶', category: 'text',
    description: 'A block of formatted text: paragraphs, bold, links, lists.',
    fields: [{ name: 'content', label: 'Text', type: 'richText' }, ALIGN],
    defaultProps: () => ({ content: paragraph('Edit this text to say what you need.'), align: 'left' }),
  },
  {
    type: 'quote', label: 'Quote', icon: '“', category: 'text',
    description: 'A highlighted quotation with an optional source.',
    fields: [area('text', 'Quote'), text('cite', 'Who said it', { width: 'half' }), text('citeUrl', 'Source link', { width: 'half' }), select('style', 'Style', opts('bar', 'large', 'plain')), ALIGN],
    defaultProps: () => ({ text: 'Good things take time.', cite: 'Someone wise', style: 'bar', align: 'left' }),
  },
  {
    type: 'icon-list', label: 'Icon list', icon: '✔', category: 'text',
    description: 'A list where every line starts with the same icon.',
    fields: [
      { name: 'items', label: 'Items', type: 'repeater', repeater: { fields: [text('text', 'Text'), text('link', 'Link (optional)')] } },
      icon(), select('layout', 'Layout', opts('stacked', 'inline')), ALIGN
    ],
    defaultProps: () => ({ items: [{text: 'Handmade in small batches', link: ''}, {text: 'Free delivery over 50', link: ''}, {text: 'Easy returns', link: ''}], icon: 'check', layout: 'stacked', align: 'left' }),
  },
  {
    type: 'list', label: 'List', icon: '☰', category: 'text',
    description: 'A bulleted or numbered list.',
    fields: [
      { name: 'items', label: 'Items', type: 'repeater', repeater: { fields: [text('text', 'Text')] } },
      select('kind', 'Marker', opts('bullets', 'numbers', 'none')), ALIGN
    ],
    defaultProps: () => ({ items: [{text: 'First point'}, {text: 'Second point'}, {text: 'Third point'}], kind: 'bullets', align: 'left' }),
  },
  // ---- media ----
  {
    type: 'image', label: 'Image', icon: '🖼', category: 'media',
    description: 'A single picture with optional link, caption and shape.',
    fields: [
      { name: 'image', label: 'Image', type: 'media' }, text('url', 'Or image address', { helpText: 'Used when no image is chosen above.' }), text('alt', 'Alt text', { helpText: 'Describe the picture for people who cannot see it.' }),
      text('caption', 'Caption'), link(), select('ratio', 'Shape', RATIO_OPTIONS), select('fit', 'Fit', opts('cover', 'contain')), number('width', 'Width (%)'), ALIGN,
    ],
    defaultProps: () => ({ ratio: 'auto', fit: 'cover', width: 100, align: 'left' }),
  },
  {
    type: 'video', label: 'Video', icon: '▶', category: 'media',
    description: 'A YouTube, Vimeo or .mp4 video at 16:9. YouTube loads from the privacy-friendly no-cookie address.',
    fields: [text('url', 'Video link', { helpText: 'A YouTube or Vimeo page address, or a direct .mp4 / .webm file.' }), text('title', 'Title (for screen readers)'), text('caption', 'Caption')],
    defaultProps: () => ({ url: '', title: 'Video' }),
  },
  {
    type: 'image-gallery', label: 'Image gallery', icon: '▦', category: 'media',
    description: 'A grid of pictures.',
    fields: [{ name: 'images', label: 'Images', type: 'mediaMulti' }, urlLines, number('columns', 'Columns (1-6)'), select('ratio', 'Shape', RATIO_OPTIONS)],
    defaultProps: () => ({ images: [], columns: 3, ratio: '1:1' }),
  },
  {
    type: 'image-carousel', label: 'Image carousel', icon: '⇄', category: 'media',
    description: 'Pictures in a row you swipe or scroll through.',
    fields: [{ name: 'images', label: 'Images', type: 'mediaMulti' }, urlLines, number('visible', 'Pictures visible (1-4)'), select('ratio', 'Shape', RATIO_OPTIONS), text('label', 'Accessible name')],
    defaultProps: () => ({ images: [], visible: 1, ratio: '16:9' }),
  },
  {
    type: 'icon', label: 'Icon', icon: '★', category: 'media',
    description: 'A single icon, optionally a link.',
    fields: [icon(), number('size', 'Size (px)'), link(), text('label', 'Accessible name (for linked icons)'), ALIGN],
    defaultProps: () => ({ icon: 'star', size: 48, align: 'center' }),
  },
  {
    type: 'logo-strip', label: 'Logo strip', icon: '▤', category: 'media',
    description: 'A row of brand or press logos.',
    fields: [
      { name: 'items', label: 'Logos', type: 'repeater', repeater: { fields: [{ name: 'image', label: 'Image', type: 'media' }, text('url', 'Or image address'), text('alt', 'Alt text')] } },
      number('height', 'Logo height (px)'), { name: 'grayscale', label: 'Greyscale until hovered', type: 'checkbox' }
    ],
    defaultProps: () => ({ items: [], height: 40, grayscale: true }),
  },
  // ---- interactive ----
  {
    type: 'accordion', label: 'Accordion', icon: '≡', category: 'interactive',
    description: 'Headings that open to show text. Opening one closes the others.',
    fields: [
      { name: 'items', label: 'Items', type: 'repeater', repeater: { fields: [text('heading', 'Heading'), area('content', 'Content')] } },
      { name: 'openFirst', label: 'First item open', type: 'checkbox' }
    ],
    defaultProps: () => ({ items: [{heading: 'How long is delivery?', content: 'Usually 3 to 5 working days.'}, {heading: 'Can I return something?', content: 'Yes, within 30 days.'}], openFirst: true }),
  },
  {
    type: 'toggle', label: 'Toggle', icon: '⊞', category: 'interactive',
    description: 'Headings that open to show text. Each opens on its own.',
    fields: [area('items', 'Items', 'One per line: "Heading | Text".'), { name: 'openFirst', label: 'First item open', type: 'checkbox' }],
    defaultProps: () => ({ items: 'Materials | Recycled and sustainably sourced.\nCare | Wipe clean with a damp cloth.', openFirst: false }),
  },
  {
    type: 'tabs', label: 'Tabs', icon: '▭', category: 'interactive',
    description: 'Content split into tabs (up to 8). Works without JavaScript.',
    fields: [
      { name: 'items', label: 'Tabs', type: 'repeater', repeater: { fields: [text('title', 'Title'), area('content', 'Content')] } }
    ],
    defaultProps: () => ({ items: [{title: 'Overview', content: 'A short introduction.'}, {title: 'Details', content: 'The finer points.'}, {title: 'Shipping', content: 'How it gets to you.'}] }),
  },
  {
    type: 'counter', label: 'Counter', icon: '#', category: 'interactive',
    description: 'A big number with a label, such as "1,200 happy customers".',
    fields: [number('number', 'Number'), number('decimals', 'Decimal places'), text('prefix', 'Prefix', { width: 'half' }), text('suffix', 'Suffix', { width: 'half' }), text('title', 'Title'), { name: 'separator', label: 'Thousands separator', type: 'checkbox' }, ALIGN],
    defaultProps: () => ({ number: 1200, decimals: 0, suffix: '+', title: 'Happy customers', separator: true, align: 'center' }),
  },
  {
    type: 'progress-bar', label: 'Progress bar', icon: '▬', category: 'interactive',
    description: 'A labelled bar showing a percentage.',
    fields: [text('title', 'Title'), number('percent', 'Percent (0-100)'), { name: 'showPercent', label: 'Show the number', type: 'checkbox' }],
    defaultProps: () => ({ title: 'Satisfaction', percent: 90, showPercent: true }),
  },
  {
    type: 'star-rating', label: 'Star rating', icon: '☆', category: 'interactive',
    description: 'A row of stars, halves allowed.',
    fields: [number('rating', 'Rating'), number('scale', 'Number of stars (1-10)'), text('title', 'Label'), ALIGN],
    defaultProps: () => ({ rating: 4.5, scale: 5, title: '4.5 from 200 reviews', align: 'left' }),
  },
  {
    type: 'alert', label: 'Alert', icon: '⚠', category: 'interactive',
    description: 'A coloured notice: information, success, warning or problem.',
    fields: [select('kind', 'Type', opts('info', 'success', 'warning', 'danger')), text('title', 'Title'), area('text', 'Message')],
    defaultProps: () => ({ kind: 'info', title: 'Good to know', text: 'Orders placed before 2pm ship the same day.' }),
  },
  {
    type: 'social-icons', label: 'Social icons', icon: '✉', category: 'interactive',
    description: 'Links to your social profiles.',
    fields: [
      { name: 'items', label: 'Links', type: 'repeater', repeater: { fields: [select('network', 'Network', SOCIAL_NETWORKS.map(n => ({ label: n.charAt(0).toUpperCase() + n.slice(1), value: n }))), text('address', 'Address')] } },
      select('shape', 'Shape', opts('circle', 'square', 'plain')), number('size', 'Icon size (px)'), ALIGN
    ],
    defaultProps: () => ({ items: [{network: 'instagram', address: 'https://instagram.com/'}, {network: 'facebook', address: 'https://facebook.com/'}, {network: 'email', address: '/contact'}], shape: 'circle', size: 20, align: 'left' }),
  },
  {
    type: 'countdown', label: 'Countdown', icon: '⏱', category: 'interactive',
    description: 'Counts down to a date and time, then shows a message.',
    fields: [text('target', 'Ends at', { helpText: 'Date and time as 2027-01-31T18:00 (24-hour, browser time zone).' }), text('expiredText', 'Message when it ends'), number('units', 'Units shown (2-4)')],
    defaultProps: () => ({ target: '2027-01-31T18:00', expiredText: 'This offer has ended.', units: 4 }),
  },
  // ---- marketing ----
  {
    type: 'testimonial', label: 'Testimonial', icon: '❝', category: 'marketing',
    description: 'A customer quote with name, role, photo and optional stars.',
    fields: [area('quote', 'Quote'), text('name', 'Name', { width: 'half' }), text('role', 'Role or place', { width: 'half' }), { name: 'photo', label: 'Photo', type: 'media' }, number('stars', 'Stars (0-5)'), ALIGN],
    defaultProps: () => ({ quote: 'Beautiful quality and it arrived the next day.', name: 'Alex P.', role: 'Customer', stars: 5, align: 'center' }),
  },
  {
    type: 'pricing-table', label: 'Pricing table', icon: '🏷', category: 'marketing',
    description: 'One plan card with price, feature list and button. Place several side by side in columns.',
    fields: [
      text('title', 'Plan name'), text('currency', 'Currency', { width: 'half' }), text('price', 'Price', { width: 'half' }), text('period', 'Period (e.g. / month)'),
      { name: 'features', label: 'Features', type: 'repeater', repeater: { fields: [text('text', 'Feature'), { name: 'included', label: 'Included', type: 'checkbox' }] } },
      text('buttonText', 'Button text', { width: 'half' }), text('buttonUrl', 'Button link', { width: 'half' }),
      text('ribbon', 'Ribbon text'), { name: 'highlight', label: 'Highlight this plan', type: 'checkbox' },
    ],
    defaultProps: () => ({ title: 'Standard', currency: '$', price: '29', period: '/ month', features: [{text: 'One user', included: true}, {text: 'Email support', included: true}, {text: 'Priority support', included: false}], buttonText: 'Choose plan', buttonUrl: '/contact', highlight: false }),
  },
  {
    type: 'price-list', label: 'Price list', icon: '💲', category: 'marketing',
    description: 'A menu-style list of items with prices.',
    fields: [
      { name: 'items', label: 'Items', type: 'repeater', repeater: { fields: [text('name', 'Name'), text('description', 'Description'), text('price', 'Price')] } }
    ],
    defaultProps: () => ({ items: [{name: 'Flat white', description: 'Double shot, steamed milk', price: '3.50'}, {name: 'Croissant', description: 'Baked this morning', price: '2.80'}] }),
  },
  {
    type: 'team-member', label: 'Team member', icon: '👤', category: 'marketing',
    description: 'A person card: photo, name, role, bio and social links.',
    fields: [{ name: 'photo', label: 'Photo', type: 'media' }, text('alt', 'Photo alt text'), text('name', 'Name', { width: 'half' }), text('role', 'Role', { width: 'half' }), area('bio', 'Short bio'), area('social', 'Social links', 'One per line: "network | address".'), ALIGN],
    defaultProps: () => ({ name: 'Jordan Lee', role: 'Founder', bio: 'Started the studio in a spare room.', social: '', align: 'center' }),
  },
  {
    type: 'flip-box', label: 'Flip box', icon: '↻', category: 'marketing',
    description: 'A card that turns over on hover or focus to reveal more.',
    fields: [icon(), text('frontTitle', 'Front title'), area('frontText', 'Front text'), text('backTitle', 'Back title'), area('backText', 'Back text'), text('buttonText', 'Button text', { width: 'half' }), text('buttonUrl', 'Button link', { width: 'half' }), number('height', 'Height (px)')],
    defaultProps: () => ({ icon: 'sparkle', frontTitle: 'Hover me', frontText: 'There is more on the other side.', backTitle: 'Surprise', backText: 'Extra detail goes here.', height: 260 }),
  },
  {
    type: 'call-to-action', label: 'Call to action', icon: '📣', category: 'marketing',
    description: 'A boxed message with one or two buttons.',
    fields: [text('title', 'Title'), area('text', 'Text'), text('buttonText', 'Button text', { width: 'half' }), text('buttonUrl', 'Button link', { width: 'half' }), text('secondText', 'Second button text', { width: 'half' }), text('secondUrl', 'Second button link', { width: 'half' }), select('tone', 'Colours', opts('dark', 'light', 'accent')), ALIGN],
    defaultProps: () => ({ title: 'Ready to get started?', text: 'Join us today.', buttonText: 'Get started', buttonUrl: '/contact', tone: 'dark', align: 'center' }),
  },
  {
    type: 'icon-box', label: 'Icon box', icon: '◉', category: 'marketing',
    description: 'An icon with a title and short text.',
    fields: [icon(), number('size', 'Icon size (px)'), text('title', 'Title'), area('text', 'Text'), link(), select('tag', 'Title tag', opts('h2', 'h3', 'h4', 'h5', 'h6', 'p')), select('layout', 'Layout', opts('top', 'left')), ALIGN],
    defaultProps: () => ({ icon: 'leaf', size: 40, title: 'Made to last', text: 'A short line about why it matters.', tag: 'h3', layout: 'top', align: 'center' }),
  },
  {
    type: 'image-box', label: 'Image box', icon: '▣', category: 'marketing',
    description: 'A picture with a title and short text beneath.',
    fields: [{ name: 'image', label: 'Image', type: 'media' }, text('url', 'Or image address'), text('alt', 'Alt text'), text('title', 'Title'), area('text', 'Text'), link(), select('tag', 'Title tag', opts('h2', 'h3', 'h4', 'h5', 'h6', 'p')), ALIGN],
    defaultProps: () => ({ title: 'Image box', text: 'A short description under the picture.', tag: 'h3', align: 'left' }),
  },
  // ---- layout ----
  {
    type: 'divider', label: 'Divider', icon: '—', category: 'layout',
    description: 'A horizontal line, optionally with a word in the middle.',
    fields: [select('style', 'Style', opts('solid', 'dashed', 'dotted', 'double')), number('weight', 'Thickness (px)'), number('width', 'Width (%)'), text('label', 'Word in the middle'), ALIGN],
    defaultProps: () => ({ style: 'solid', weight: 1, width: 100, align: 'center' }),
  },
  {
    type: 'spacer', label: 'Spacer', icon: '↕', category: 'layout',
    description: 'Empty vertical space.',
    fields: [number('height', 'Height (px)')],
    defaultProps: () => ({ height: 48 }),
  },
  {
    type: 'anchor', label: 'Menu anchor', icon: '⚓', category: 'layout',
    description: 'An invisible jump point. A link to /page#name scrolls here.',
    fields: [text('id', 'Anchor name', { helpText: 'Lowercase letters, numbers and hyphens. Link to it as #name.' })],
    defaultProps: () => ({ id: 'section' }),
  },
  {
    type: 'html', label: 'HTML', icon: '</>', category: 'layout',
    description: 'Your own markup. Scripts, iframes, forms and event handlers are removed for safety.',
    fields: [area('html', 'HTML', 'Basic tags only: text, lists, tables, images, links.')],
    defaultProps: () => ({ html: '<p>Your <strong>HTML</strong> here.</p>' }),
  },
  // ---- site ----
  {
    type: 'map', label: 'Map', icon: '🗺', category: 'siteMeta',
    description: 'An embedded map from an address or coordinates (Google Maps or OpenStreetMap).',
    fields: [text('address', 'Address or "lat,lng"'), text('embedUrl', 'Or a pasted embed link', { helpText: 'Only google.com/maps and openstreetmap.org embed links are accepted.' }), number('zoom', 'Zoom (1-20)'), number('height', 'Height (px)'), text('title', 'Title (for screen readers)')],
    defaultProps: () => ({ address: 'Trafalgar Square, London', zoom: 14, height: 320, title: 'Map' }),
  },
]
