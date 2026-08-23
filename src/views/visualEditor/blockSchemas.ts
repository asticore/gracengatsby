/**
 * Client-side mirror of the block field configs in src/blocks/*.ts.
 *
 * These drive the element library and the auto-generated field panel in the
 * visual editor. They're kept separate from the real Payload Block configs
 * (which live server-side and pull in server-only editor/access code) so this
 * file can be imported straight into a 'use client' bundle.
 *
 * If you add a field to a block in src/blocks/*.ts, mirror it here too.
 */

export type EditorFieldType =
  | 'text'
  | 'textarea'
  | 'richText'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'media'
  | 'mediaMulti'
  | 'relationship'

export type EditorField = {
  name: string
  label: string
  type: EditorFieldType
  options?: { label: string; value: string }[]
  relationTo?: string
  width?: 'full' | 'half'
  helpText?: string
  /** Text fields that accept {{merge tags}} show the tag picker. */
  supportsMergeTags?: boolean
}

/** Groups the element library into browsable sections. */
export type BlockCategory = 'layout' | 'basic' | 'media' | 'dynamic'

export const BLOCK_CATEGORIES: { key: BlockCategory; label: string }[] = [
  { key: 'layout', label: 'Layout' },
  { key: 'basic', label: 'Basic' },
  { key: 'media', label: 'Media' },
  { key: 'dynamic', label: 'Dynamic' },
]

export type BlockDef = {
  slug: string
  label: string
  icon: string
  category: BlockCategory
  description: string
  fields: EditorField[]
  defaultValue: () => Record<string, unknown>
}

const CATEGORY_OPTIONS = [
  { label: 'Apparel', value: 'apparel' },
  { label: 'Accessories', value: 'accessories' },
  { label: 'Jewellery', value: 'jewellery' },
  { label: 'Homeware', value: 'homeware' },
  { label: 'Gifting', value: 'gifting' },
]

export const VISUAL_BLOCKS: BlockDef[] = [
  {
    slug: 'section',
    label: 'Section',
    icon: '▦',
    category: 'layout',
    description: 'A row of columns. Drop blocks inside each column, and nest sections as deep as you like.',
    fields: [],
    defaultValue: () => ({ blockType: 'section', columns: [] }),
  },
  {
    slug: 'hero',
    label: 'Hero',
    icon: '⭐',
    category: 'basic',
    description: 'Large banner with a heading, supporting text and up to two buttons.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      { name: 'subheading', label: 'Subheading', type: 'textarea', supportsMergeTags: true },
      { name: 'backgroundImage', label: 'Background image', type: 'media' },
      { name: 'primaryCtaLabel', label: 'Primary button label', type: 'text', width: 'half', supportsMergeTags: true },
      { name: 'primaryCtaUrl', label: 'Primary button link', type: 'text', width: 'half', supportsMergeTags: true },
      { name: 'secondaryCtaLabel', label: 'Secondary button label', type: 'text', width: 'half', supportsMergeTags: true },
      { name: 'secondaryCtaUrl', label: 'Secondary button link', type: 'text', width: 'half', supportsMergeTags: true },
    ],
    defaultValue: () => ({ blockType: 'hero', heading: 'New heading' }),
  },
  {
    slug: 'richText',
    label: 'Rich Text',
    icon: '\u{1F4C4}',
    category: 'basic',
    description: 'A block of formatted copy.',
    fields: [{ name: 'content', label: 'Text', type: 'richText' }],
    defaultValue: () => ({ blockType: 'richText' }),
  },
  {
    slug: 'ctaBanner',
    label: 'CTA Banner',
    icon: '\u{1F4E3}',
    category: 'basic',
    description: 'A full-width call to action with a heading and button.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      { name: 'text', label: 'Text', type: 'textarea', supportsMergeTags: true },
      { name: 'buttonLabel', label: 'Button label', type: 'text', width: 'half', supportsMergeTags: true },
      { name: 'buttonUrl', label: 'Button link', type: 'text', width: 'half', supportsMergeTags: true },
      {
        name: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Dark background', value: 'dark' },
          { label: 'Light background', value: 'light' },
        ],
      },
    ],
    defaultValue: () => ({ blockType: 'ctaBanner', heading: 'New call to action', style: 'dark' }),
  },
  {
    slug: 'imageText',
    label: 'Image + Text',
    icon: '\u{1F5BC}️',
    category: 'media',
    description: 'An image beside a block of copy.',
    fields: [
      { name: 'image', label: 'Image', type: 'media' },
      { name: 'content', label: 'Text', type: 'richText' },
      {
        name: 'imageSide',
        label: 'Image position',
        type: 'select',
        options: [
          { label: 'Image on left', value: 'left' },
          { label: 'Image on right', value: 'right' },
        ],
      },
    ],
    defaultValue: () => ({ blockType: 'imageText', imageSide: 'left' }),
  },
  {
    slug: 'gallery',
    label: 'Gallery',
    icon: '\u{1F5BC}️',
    category: 'media',
    description: 'A grid of images.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      { name: 'images', label: 'Images', type: 'mediaMulti' },
    ],
    defaultValue: () => ({ blockType: 'gallery', images: [] }),
  },
  {
    slug: 'loop',
    label: 'Loop',
    icon: '\u{1F501}',
    category: 'dynamic',
    description: 'Repeats a Page Template once per product, post or event - use merge tags inside the template.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      {
        name: 'template',
        label: 'Card template',
        type: 'relationship',
        relationTo: 'page-templates',
        helpText: 'The Page Template used as the design for each item.',
      },
      {
        name: 'source',
        label: 'Show items from',
        type: 'select',
        options: [
          { label: 'Products', value: 'products' },
          { label: 'Blog posts', value: 'posts' },
          { label: 'Events', value: 'events' },
          { label: 'FAQs', value: 'faqs' },
          { label: 'Pages', value: 'pages' },
        ],
      },
      { name: 'category', label: 'Category (blank = all)', type: 'text' },
      { name: 'limit', label: 'How many items', type: 'number', width: 'half' },
      { name: 'columns', label: 'Columns', type: 'number', width: 'half' },
      {
        name: 'sortBy',
        label: 'Sort by',
        type: 'select',
        options: [
          { label: 'Newest first', value: 'newest' },
          { label: 'Oldest first', value: 'oldest' },
          { label: 'Title A-Z', value: 'title' },
        ],
      },
    ],
    defaultValue: () => ({ blockType: 'loop', source: 'products', limit: 6, columns: 3, sortBy: 'newest' }),
  },
  {
    slug: 'productGrid',
    label: 'Product Grid',
    icon: '\u{1F6CD}️',
    category: 'dynamic',
    description: 'A grid of products, filtered by category.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      { name: 'category', label: 'Category (blank = all)', type: 'select', options: CATEGORY_OPTIONS },
      { name: 'limit', label: 'How many products', type: 'number' },
    ],
    defaultValue: () => ({ blockType: 'productGrid', heading: 'Shop', limit: 4 }),
  },
  {
    slug: 'eventGrid',
    label: 'Event Grid',
    icon: '\u{1F4C5}',
    category: 'dynamic',
    description: 'Upcoming (or past) events.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      { name: 'showPast', label: 'Show past events instead of upcoming', type: 'checkbox' },
      { name: 'limit', label: 'How many events', type: 'number' },
    ],
    defaultValue: () => ({ blockType: 'eventGrid', heading: 'Events', limit: 3 }),
  },
  {
    slug: 'faq',
    label: 'FAQ',
    icon: '❓',
    category: 'dynamic',
    description: 'A list of questions and answers.',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text', supportsMergeTags: true },
      {
        name: 'source',
        label: 'Which FAQs',
        type: 'select',
        options: [
          { label: 'All FAQs in a category', value: 'category' },
          { label: 'Hand-pick specific FAQs', value: 'manual' },
        ],
      },
      { name: 'category', label: 'Category (blank = all)', type: 'text' },
      { name: 'faqs', label: 'Hand-picked FAQs', type: 'relationship', relationTo: 'faqs' },
    ],
    defaultValue: () => ({ blockType: 'faq', heading: 'Frequently asked questions', source: 'category' }),
  },
]

export function getBlockDef(blockType: string): BlockDef | undefined {
  return VISUAL_BLOCKS.find((b) => b.slug === blockType)
}

/** Blocks offered inside a Section column - everything except Section itself is
 * allowed, and Section is allowed too so layouts can nest. */
export const NESTABLE_BLOCKS = VISUAL_BLOCKS

export type CanvasBlock = Record<string, unknown> & { blockType: string; _tempId: string }
