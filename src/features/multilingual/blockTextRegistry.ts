/**
 * Which text inside page-builder blocks can be translated.
 *
 * This is the one place that decides it. Adding a block type is one line in
 * `BLOCK_TEXT`; adding an element type (the `element` block carries its own
 * catalogue, see src/lib/elements/registry.ts) is one line in `ELEMENT_TEXT`.
 * The Translations screen, the builder's Translate panel, the machine drafts
 * and the public overlay all read these lists through blockText.ts.
 *
 * Only short plain text belongs here: headings, subheadings, button and link
 * labels, short sentences, image alt text. Never: URLs, slugs, ids, prices,
 * dates, code, CSS, colours, rich text (Lexical trees), or anything a
 * relationship points at. Paths are relative to the block; for `element`
 * blocks they are relative to the element's `props`.
 */

export type BlockTextFieldSpec = {
  /** Dot path inside the block (or inside `props` for an element). */
  path: string
  label: string
  /** 'text' renders one line, 'long' a textarea. */
  size: 'text' | 'long'
}

export type BlockTextSpec = {
  label: string
  fields: BlockTextFieldSpec[]
}

const text = (path: string, label: string): BlockTextFieldSpec => ({ path, label, size: 'text' })
const long = (path: string, label: string): BlockTextFieldSpec => ({ path, label, size: 'long' })

/** Top-level CMS block types (src/blocks/*.ts), keyed by block slug. */
export const BLOCK_TEXT: Record<string, BlockTextSpec> = {
  hero: {
    label: 'Hero',
    fields: [
      text('heading', 'Heading'),
      long('subheading', 'Subheading'),
      text('primaryCtaLabel', 'Primary button'),
      text('secondaryCtaLabel', 'Secondary button'),
    ],
  },
  ctaBanner: {
    label: 'Call to action',
    fields: [text('heading', 'Heading'), long('text', 'Text'), text('buttonLabel', 'Button label')],
  },
  productGrid: { label: 'Product grid', fields: [text('heading', 'Heading')] },
  eventGrid: { label: 'Event grid', fields: [text('heading', 'Heading')] },
  gallery: { label: 'Gallery', fields: [text('heading', 'Heading')] },
  faq: { label: 'FAQ', fields: [text('heading', 'Heading')] },
  loop: { label: 'Loop', fields: [text('heading', 'Heading')] },
  toc: { label: 'Table of contents', fields: [text('title', 'Title')] },
  form: { label: 'Form', fields: [text('heading', 'Heading'), long('intro', 'Intro')] },
}

/**
 * Element types inside the `element` block, keyed by `elementType`. Paths are
 * relative to `props`, so `text` here is stored at `props.text`.
 */
export const ELEMENT_BLOCK_TYPE = 'element'

export const ELEMENT_TEXT: Record<string, BlockTextSpec> = {
  heading: { label: 'Heading', fields: [text('text', 'Text'), text('secondText', 'Second part'), long('words', 'Rotating words')] },
  'dual-heading': { label: 'Dual heading', fields: [text('first', 'First part'), text('second', 'Second part')] },
  'animated-headline': { label: 'Animated headline', fields: [text('before', 'Before'), long('words', 'Words'), text('after', 'After')] },
  'highlight-text': { label: 'Highlight text', fields: [text('before', 'Before'), text('phrase', 'Highlighted phrase'), text('after', 'After')] },
  'gradient-text': { label: 'Gradient text', fields: [text('text', 'Text')] },
  'split-text': { label: 'Split text', fields: [text('text', 'Text')] },
  'outline-text': { label: 'Outline text', fields: [text('text', 'Text')] },
  button: { label: 'Button', fields: [text('text', 'Label')] },
  'add-to-cart': { label: 'Add to cart', fields: [text('label', 'Label')] },
  'cart-link': { label: 'Cart link', fields: [text('label', 'Label')] },
  image: { label: 'Image', fields: [text('alt', 'Alt text'), text('caption', 'Caption')] },
  video: { label: 'Video', fields: [text('title', 'Title'), text('caption', 'Caption')] },
  audio: { label: 'Audio', fields: [text('title', 'Title')] },
  'image-carousel': { label: 'Image carousel', fields: [text('label', 'Label')] },
  icon: { label: 'Icon', fields: [text('label', 'Label')] },
  quote: { label: 'Quote', fields: [long('text', 'Quote'), text('cite', 'Citation')] },
  testimonial: { label: 'Testimonial', fields: [long('quote', 'Quote'), text('name', 'Name'), text('role', 'Role')] },
  'icon-box': { label: 'Icon box', fields: [text('title', 'Title'), long('text', 'Text')] },
  'image-box': { label: 'Image box', fields: [text('alt', 'Alt text'), text('title', 'Title'), long('text', 'Text')] },
  card: {
    label: 'Card',
    fields: [text('title', 'Title'), long('text', 'Text'), text('linkLabel', 'Link label'), text('backTitle', 'Back title'), long('backText', 'Back text')],
  },
  'flip-box': {
    label: 'Flip box',
    fields: [text('frontTitle', 'Front title'), long('frontText', 'Front text'), text('backTitle', 'Back title'), long('backText', 'Back text'), text('buttonText', 'Button label')],
  },
  'call-to-action': {
    label: 'Call to action',
    fields: [text('title', 'Title'), long('text', 'Text'), text('buttonText', 'Button label'), text('secondText', 'Second button label')],
  },
  alert: { label: 'Alert', fields: [text('title', 'Title'), long('text', 'Text'), text('buttonText', 'Button label')] },
  'pricing-table': { label: 'Pricing table', fields: [text('title', 'Title'), text('buttonText', 'Button label'), text('ribbon', 'Ribbon')] },
  'team-member': { label: 'Team member', fields: [text('alt', 'Alt text'), text('name', 'Name'), text('role', 'Role'), long('bio', 'Bio')] },
  'author-box': { label: 'Author box', fields: [text('name', 'Name'), long('bio', 'Bio'), text('label', 'Label')] },
  counter: { label: 'Counter', fields: [text('title', 'Title')] },
  'count-up': { label: 'Count up', fields: [text('label', 'Label')] },
  'progress-bar': { label: 'Progress bar', fields: [text('title', 'Title')] },
  'circle-progress': { label: 'Circle progress', fields: [text('label', 'Label')] },
  countdown: { label: 'Countdown', fields: [text('expiredText', 'Message when finished')] },
  'sticky-bar': { label: 'Sticky bar', fields: [text('text', 'Text'), text('buttonLabel', 'Button label')] },
  tooltip: { label: 'Tooltip', fields: [text('text', 'Text'), long('tip', 'Tip')] },
  'search-box': { label: 'Search box', fields: [text('placeholder', 'Placeholder'), text('buttonLabel', 'Button label')] },
  'share-buttons': { label: 'Share buttons', fields: [text('title', 'Title')] },
  divider: { label: 'Divider', fields: [text('label', 'Label')] },
  'back-to-top': { label: 'Back to top', fields: [text('label', 'Label')] },
  'nav-menu': { label: 'Menu', fields: [text('label', 'Label')] },
  'auto-breadcrumbs': { label: 'Breadcrumbs', fields: [text('homeLabel', 'Home label')] },
  pagination: { label: 'Pagination', fields: [text('prevLabel', 'Previous label'), text('nextLabel', 'Next label')] },
  'post-navigation': { label: 'Post navigation', fields: [text('prevLabel', 'Previous label'), text('nextLabel', 'Next label')] },
  'business-hours': { label: 'Business hours', fields: [text('title', 'Title')] },
}
