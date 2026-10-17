import { FORM_ELEMENTS } from '@/features/forms/elementDefs'

import type { EditorField } from './fieldTypes'
import { WAVE26_ELEMENTS } from './wave26Defs'
import { WAVE36_ELEMENTS } from './wave36Defs'

/**
 * The per-element-type catalogue that lives inside the `element` block
 * (src/blocks/Element.ts). This is what makes the ~40-element library
 * possible without a schema cost per element - see that file's comment for
 * why. Every entry here is a row value, not a database column.
 *
 * Grouping: NOT Elementor's Free/Pro split - every element here is available
 * regardless of category, so a tier-based grouping would be meaningless (and
 * was explicitly ruled out). Grouped instead by what the element actually
 * does. This is the proposed scheme for the full ~40-element pass (Phase 4) -
 * flag any element that reads better under a different category once more of
 * them exist.
 */
export type ElementCategory = 'text' | 'media' | 'interactive' | 'marketing' | 'layout' | 'commerce' | 'siteMeta' | 'formFields'

export const ELEMENT_CATEGORIES: { key: ElementCategory; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'media', label: 'Media' },
  { key: 'interactive', label: 'Interactive' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'layout', label: 'Layout' },
  { key: 'commerce', label: 'Shop' },
  { key: 'siteMeta', label: 'Site' },
  { key: 'formFields', label: 'Form fields' },
]

export type ElementDef = {
  type: string
  label: string
  /**
   * Plain-text icon glyph for now (matches every other icon in
   * blockSchemas.ts). Swap these for real FontAwesome icons in one pass once
   * the icon font is self-hosted under /public - not done yet, see the
   * Phase 1 note in the progress report.
   */
  icon: string
  category: ElementCategory
  description: string
  fields: EditorField[]
  defaultProps: () => Record<string, unknown>
  /** Hide from the element library/picker. The renderer stays so existing pages keep working. */
  hidden?: boolean
}

export const ELEMENTS: ElementDef[] = [
  {
    type: 'heading',
    label: 'Heading',
    icon: '🔠',
    category: 'text',
    description: 'A single heading line - pick its HTML tag independently of its visual size.',
    fields: [
      { name: 'text', label: 'Text', type: 'text', supportsMergeTags: true },
      {
        name: 'tag',
        label: 'HTML tag',
        type: 'select',
        width: 'half',
        options: [
          { label: 'H1', value: 'h1' },
          { label: 'H2', value: 'h2' },
          { label: 'H3', value: 'h3' },
          { label: 'H4', value: 'h4' },
          { label: 'H5', value: 'h5' },
          { label: 'H6', value: 'h6' },
        ],
        helpText: 'Semantic level (for accessibility/SEO). Visual size is set on the Style tab.',
      },
      {
        name: 'align',
        label: 'Alignment',
        type: 'select',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ],
      },
      { name: 'link', label: 'Link (optional)', type: 'link', helpText: 'Makes the whole heading clickable.' },
    ],
    defaultProps: () => ({ text: 'New heading', tag: 'h2', align: 'left' }),
  },
]

ELEMENTS.push({
  type: 'ad',
  label: 'Ad',
  icon: '📢',
  category: 'marketing',
  description: 'An ad slot. Shows a labelled placeholder here; real ads load on the live site after marketing consent.',
  fields: [
    { name: 'placement', label: 'Placement key', type: 'text', helpText: 'The key of a placement under Ads > Placements.' },
    { name: 'unit', label: 'Or ad unit key', type: 'text', helpText: 'Use a unit key directly if you have no placement.' },
  ],
  defaultProps: () => ({ placement: '' }),
})

ELEMENTS.push({
  type: 'data-view',
  label: 'Table or chart',
  icon: '📊',
  category: 'interactive',
  description: 'A saved table or chart from Content > Tables and charts. It shows the live data on the page and a preview here.',
  fields: [{ name: 'view', label: 'Table or chart', type: 'relationship', relationTo: 'data-views', helpText: 'Pick one you built under Content > Tables and charts.' }],
  defaultProps: () => ({ view: undefined }),
})
ELEMENTS.push({
  type: 'content-slot',
  label: 'Template content',
  icon: '📄',
  category: 'layout',
  description: 'In a site template: the place where the page, post, product or event itself appears. A template without one shows its sections first and the content after them.',
  fields: [],
  defaultProps: () => ({}),
})
// Form-builder elements (form fields, steps, the Form placement, Button). Kept in the forms feature so
// this file only gains one registration.
ELEMENTS.push(...FORM_ELEMENTS)
ELEMENTS.push(...WAVE26_ELEMENTS)
ELEMENTS.push(...WAVE36_ELEMENTS)

export function getElementDef(type: string): ElementDef | undefined {
  return ELEMENTS.find((e) => e.type === type)
}
