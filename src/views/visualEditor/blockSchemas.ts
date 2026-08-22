/**
 * Client-side mirror of the block field configs in src/blocks/*.ts.
 *
 * These drive the auto-generated field panel in the visual editor canvas.
 * They're kept separate from the real Payload Block configs (which live
 * server-side and pull in server-only editor/access code) so this file can
 * be imported straight into a 'use client' bundle.
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
}

export type BlockDef = {
  slug: string
  label: string
  icon: string
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
    slug: 'hero',
    label: 'Hero',
    icon: '⭐',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'subheading', label: 'Subheading', type: 'textarea' },
      { name: 'backgroundImage', label: 'Background image', type: 'media' },
      { name: 'primaryCtaLabel', label: 'Primary button label', type: 'text', width: 'half' },
      { name: 'primaryCtaUrl', label: 'Primary button link', type: 'text', width: 'half' },
      { name: 'secondaryCtaLabel', label: 'Secondary button label', type: 'text', width: 'half' },
      { name: 'secondaryCtaUrl', label: 'Secondary button link', type: 'text', width: 'half' },
    ],
    defaultValue: () => ({ blockType: 'hero', heading: 'New heading' }),
  },
  {
    slug: 'richText',
    label: 'Rich Text',
    icon: '\u{1F4C4}',
    fields: [{ name: 'content', label: 'Text', type: 'richText' }],
    defaultValue: () => ({ blockType: 'richText' }),
  },
  {
    slug: 'imageText',
    label: 'Image + Text',
    icon: '\u{1F5BC}️',
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
    slug: 'productGrid',
    label: 'Product Grid',
    icon: '\u{1F6CD}️',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'category', label: 'Category (blank = all)', type: 'select', options: CATEGORY_OPTIONS },
      { name: 'limit', label: 'How many products', type: 'number' },
    ],
    defaultValue: () => ({ blockType: 'productGrid', heading: 'Shop', limit: 4 }),
  },
  {
    slug: 'eventGrid',
    label: 'Event Grid',
    icon: '\u{1F4C5}',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'showPast', label: 'Show past events instead of upcoming', type: 'checkbox' },
      { name: 'limit', label: 'How many events', type: 'number' },
    ],
    defaultValue: () => ({ blockType: 'eventGrid', heading: 'Events', limit: 3 }),
  },
  {
    slug: 'gallery',
    label: 'Gallery',
    icon: '\u{1F5BC}️',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'images', label: 'Images', type: 'mediaMulti' },
    ],
    defaultValue: () => ({ blockType: 'gallery', images: [] }),
  },
  {
    slug: 'faq',
    label: 'FAQ',
    icon: '❓',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
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
  {
    slug: 'ctaBanner',
    label: 'CTA Banner',
    icon: '\u{1F4E3}',
    fields: [
      { name: 'heading', label: 'Heading', type: 'text' },
      { name: 'text', label: 'Text', type: 'textarea' },
      { name: 'buttonLabel', label: 'Button label', type: 'text', width: 'half' },
      { name: 'buttonUrl', label: 'Button link', type: 'text', width: 'half' },
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
]

export function getBlockDef(blockType: string): BlockDef | undefined {
  return VISUAL_BLOCKS.find((b) => b.slug === blockType)
}

export type CanvasBlock = Record<string, unknown> & { blockType: string; _tempId: string }
