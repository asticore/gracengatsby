import type { EditorField } from './fieldTypes'

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
export type ElementCategory = 'text' | 'media' | 'interactive' | 'marketing' | 'layout' | 'commerce' | 'siteMeta'

export const ELEMENT_CATEGORIES: { key: ElementCategory; label: string }[] = [
  { key: 'text', label: 'Text' },
  { key: 'media', label: 'Media' },
  { key: 'interactive', label: 'Interactive' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'layout', label: 'Layout' },
  { key: 'commerce', label: 'Shop' },
  { key: 'siteMeta', label: 'Site' },
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
      { name: 'link', label: 'Link (optional)', type: 'text', helpText: 'Makes the whole heading clickable.' },
    ],
    defaultProps: () => ({ text: 'New heading', tag: 'h2', align: 'left' }),
  },
]

export function getElementDef(type: string): ElementDef | undefined {
  return ELEMENTS.find((e) => e.type === type)
}
