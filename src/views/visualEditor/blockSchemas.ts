/**
 * Client-side mirror of the block field configs in src/blocks/*.ts.
 *
 * These drive the element library and the auto-generated field panel in the
 * visual editor. They're kept separate from the real CMS Block configs
 * (which live server-side and pull in server-only editor/access code) so this
 * file can be imported straight into a 'use client' bundle.
 *
 * If you add a field to a block in src/blocks/*.ts, mirror it here too.
 */

import type { EditorField } from '@/lib/elements/fieldTypes'
import { ELEMENTS, ELEMENT_CATEGORIES, type ElementCategory } from '@/lib/elements/registry'
import { FORM_ONLY_ELEMENT_TYPES } from '@/features/forms/elementDefs'

// Re-exported from src/lib/elements/fieldTypes.ts, which also backs the
// per-element-type registry (src/lib/elements/registry.ts) - kept there
// instead of only here so that file doesn't have to import a views/ module.
export type { EditorField, EditorFieldType } from '@/lib/elements/fieldTypes'

/** Groups the element library into browsable sections. */
type BlockCategory = 'layout' | 'basic' | 'media' | 'dynamic' | 'formFields' | `el:${Exclude<ElementCategory, 'formFields'>}`

export const BLOCK_CATEGORIES: { key: BlockCategory; label: string }[] = [
  { key: 'layout', label: 'Layout' },
  { key: 'basic', label: 'Basic' },
  { key: 'media', label: 'Media' },
  { key: 'dynamic', label: 'Dynamic' },
  // One section per registry element category (src/lib/elements/registry.ts ELEMENT_CATEGORIES).
  // Labels carry "elements" where the plain word is already a block category above.
  ...ELEMENT_CATEGORIES.filter((c) => c.key !== 'formFields').map((c) => ({
    key: `el:${c.key}` as BlockCategory,
    label: c.key === 'media' || c.key === 'layout' ? `${c.label} elements` : c.label,
  })),
  { key: 'formFields', label: 'Form fields' },
]

export type BlockDef = {
  slug: string
  label: string
  icon: string
  category: BlockCategory
  description: string
  fields: EditorField[]
  defaultValue: () => Record<string, unknown>
  /** Kept in this array (so getBlockDef still resolves its fields for the Settings panel
   *  and CanvasBlockPreview) but left out of the Elements library grid in ElementLibrary.tsx -
   *  for blocks that ship as a fixed, opinionated layout rather than a composable primitive,
   *  which only belongs in a curated Template (templatePresets.ts / Page Templates), not as
   *  something dropped in freely block-by-block. */
  hiddenFromLibrary?: boolean
}

const CATEGORY_OPTIONS = [
  { label: 'Accessories', value: 'accessories' },
  { label: 'Jewellery', value: 'jewellery' },
  { label: 'Homeware', value: 'homeware' },
  { label: 'Gifting', value: 'gifting' },
]

const VISUAL_BLOCKS: BlockDef[] = [
  {
    slug: 'section',
    label: 'Section',
    icon: String.fromCodePoint(0x25a6),
    category: 'layout',
    description: 'A row of columns - you pick the structure when you add it. Drop blocks inside each column.',
    fields: [],
    defaultValue: () => ({ blockType: 'section', columns: [] }),
  },
  {
    slug: 'hero',
    label: 'Hero',
    icon: String.fromCodePoint(0x2b50),
    category: 'basic',
    // Not offered as a plain draggable element - see hiddenFromLibrary. A fixed banner
    // layout works against "as customisable as Elementor": building the same effect from a
    // Section + Rich Text + buttons gives full control over columns, widths and styling,
    // where Hero is one rigid shape. It's still available pre-composed from the Templates
    // tab (templatePresets.ts has a couple of hero starters), and existing pages that already
    // use it keep rendering and stay fully editable here.
    hiddenFromLibrary: true,
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
    // Legacy monolith: templatePresets.ts offers 'cta-banner' and 'cta-two-buttons' built from
    // granular elements. Hidden from the library only; renderer, schema and existing pages stay.
    hiddenFromLibrary: true,
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
    slug: 'form',
    label: 'Form',
    icon: '\u{1F4DD}',
    category: 'basic',
    description: 'Embeds a form built under Content > Forms.',
    fields: [
      {
        name: 'form',
        label: 'Form',
        type: 'relationship',
        relationTo: 'forms',
        helpText: 'No form yet? Create one in Forms (Settings > Forms) and pick it here.',
      },
      { name: 'heading', label: 'Heading (overrides form name)', type: 'text', supportsMergeTags: true },
      { name: 'showTitle', label: "Show the form's name above it", type: 'checkbox' },
      { name: 'intro', label: 'Intro text', type: 'textarea', supportsMergeTags: true },
    ],
    defaultValue: () => ({ blockType: 'form', showTitle: true }),
  },
  {
    slug: 'imageText',
    label: 'Image + Text',
    icon: String.fromCodePoint(0x1f5bc, 0xfe0f),
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
    icon: String.fromCodePoint(0x1f5bc, 0xfe0f),
    category: 'media',
    description: 'A grid of images.',
    // Legacy monolith: templatePresets.ts offers 'gallery-grid' and 'gallery-cta'. Library-hidden only.
    hiddenFromLibrary: true,
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
    icon: String.fromCodePoint(0x1f6cd, 0xfe0f),
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
    icon: String.fromCodePoint(0x2753),
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
  {
    slug: 'reusableSection',
    label: 'Reusable section',
    icon: String.fromCodePoint(0x1f501),
    category: 'dynamic',
    description: 'Shows a section built once under Content > Reusable sections. Edits there update every page that uses it.',
    fields: [{ name: 'section', label: 'Which section', type: 'relationship', relationTo: 'reusable-sections' }],
    defaultValue: () => ({ blockType: 'reusableSection' }),
  },
  {
    slug: 'element',
    label: 'Element',
    icon: String.fromCodePoint(0x1f9e9),
    category: 'basic',
    description: 'One of the element-library items (heading, icon box, countdown, ...) - see src/lib/elements/registry.ts.',
    // Never offered directly - the library shows one card per registry entry
    // instead (synthetic slug "element:<type>", resolved in VisualEditor.tsx's
    // buildNode and rendered by FieldPanel's isElement branch), so a bare
    // "element" card with no elementType set would have nothing to edit.
    hiddenFromLibrary: true,
    fields: [],
    defaultValue: () => ({ blockType: 'element', elementType: '', props: {} }),
  },
]

/** Library card slug for a section that is inserted inside a column. */
export const INNER_SECTION_SLUG = 'inner-section'

export function getBlockDef(blockType: string): BlockDef | undefined {
  return VISUAL_BLOCKS.find((b) => b.slug === blockType)
}

/**
 * Library-only view: real blocks (minus hiddenFromLibrary ones) plus one
 * synthetic card per src/lib/elements/registry.ts entry, slugged
 * "element:<type>". ElementLibrary.tsx renders this instead of VISUAL_BLOCKS
 * directly. Kept separate from VISUAL_BLOCKS/getBlockDef so those two stay
 * block-shape lookups only - VisualEditor.tsx's buildNode is what actually
 * turns an "element:<type>" pick into a real node, before a BlockDef lookup
 * ever happens.
 */
export function libraryCards(options: { formMode?: boolean } = {}): BlockDef[] {
  const formMode = options.formMode === true
  // In the form builder only layout (sections/columns), headings, buttons and the form fields make sense;
  // everywhere else the form-only fields are hidden.
  const elementCards: BlockDef[] = ELEMENTS.filter((el) => {
    if (el.hidden) return false
    const formOnly = FORM_ONLY_ELEMENT_TYPES.has(el.type)
    return formMode ? formOnly || el.type === 'heading' || el.type === 'button' : !formOnly
  }).map(
    (el): BlockDef => ({
      slug: `element:${el.type}`,
      label: el.label,
      icon: el.icon,
      category: el.category === 'formFields' || FORM_ONLY_ELEMENT_TYPES.has(el.type) ? 'formFields' : (`el:${el.category}` as BlockCategory),
      description: el.description,
      fields: [],
      defaultValue: () => ({ blockType: 'element', elementType: el.type, props: el.defaultProps() }),
    }),
  )
  const blocks = VISUAL_BLOCKS.filter((b) => !b.hiddenFromLibrary && (!formMode || b.slug === 'section'))
  // A section that goes inside a column (Elementor's "Inner section"): the same data as a Section,
  // offered as its own card so it is easy to find. VisualEditor.tsx puts it in the selected column.
  const innerSection: BlockDef = {
    slug: INNER_SECTION_SLUG,
    label: 'Inner section',
    icon: String.fromCodePoint(0x25a3),
    category: 'layout',
    description: 'A section placed inside a column, with its own columns. Select a column first, then add it.',
    fields: [],
    defaultValue: () => ({ blockType: 'section', columns: [] }),
  }
  return [...blocks, ...(formMode ? [] : [innerSection]), ...elementCards]
}
