import type { Block, FieldHook } from '@/engine'

import { blockStyleField } from './styleField'
import { parseOldFormat } from '@/lib/blockStyle'

/**
 * Upgrade old string format for repeater fields to new array format.
 * For backwards compatibility when editing old pages with new repeater fields.
 */
const upgradeRepeaterFormats: FieldHook = async ({ data, originalDoc, value }) => {
  if (!data?.elementType || !data?.props || typeof data.props !== 'object') {
    return value
  }

  const elementType = String(data.elementType)
  const props = data.props as Record<string, unknown>

  // Define which fields in which elements are repeaters and how to parse their old format
  const repeaterUpgrades: Record<string, Record<string, string[]>> = {
    'icon-list': { items: ['text', 'link'] },
    'list': { items: ['text'] },
    'accordion': { items: ['heading', 'content'] },
    'tabs': { items: ['title', 'content'] },
    'pricing-table': { features: ['text', 'included'] },
    'price-list': { items: ['name', 'description', 'price'] },
    'social-icons': { items: ['network', 'address'] },
    'logo-strip': { items: ['url', 'alt'] },
  }

  const fieldMap = repeaterUpgrades[elementType]
  if (!fieldMap) return value

  let upgraded = false
  const updatedProps = { ...props }

  for (const [fieldName, fieldNames] of Object.entries(fieldMap)) {
    const fieldValue = props[fieldName]
    // Only upgrade if it's a string (old format) and not already an array (new format)
    if (typeof fieldValue === 'string') {
      updatedProps[fieldName] = parseOldFormat(fieldValue, fieldNames)
      upgraded = true
    }
  }

  if (upgraded) {
    return { ...value, props: updatedProps }
  }

  return value
}

/**
 * One generic block that carries an unlimited catalogue of Elementor-style
 * elements (heading, icon box, countdown, progress bar, and everything else
 * in the element library) without a schema cost per element.
 *
 * Why one block instead of one per element type: every block slug creates its
 * own child table on every surface that embeds the page-builder library
 * (Pages, Posts, Products, Page Templates, three settings globals, Lessons -
 * eight parents, three of them doubled for their draft/version twin). A
 * dedicated block per new element would mean roughly eleven new tables PER
 * ELEMENT - adding the ~40 elements planned for the library that way would
 * mean several hundred new D1 tables. Wrapping them all in one `element`
 * block costs that eleven-table set exactly once; every element after that is
 * a row value, not a schema change. Same trick `Section.ts` uses for
 * arbitrary nesting via its `columns` JSON column - see that file's comment.
 *
 * `elementType` picks which element this is (`heading`, `iconBox`,
 * `countdown`, ...). `props` is that element's own content fields
 * (text, icon name, target date, ...), and reuses the shared `design` column
 * for Style/Advanced settings so every element gets the same
 * responsive/hover/unit-aware controls for free. Both are parsed against a
 * per-elementType schema in src/lib/elements/registry.ts - keep that in sync
 * whenever a new element type is added.
 */
export const ElementBlock: Block = {
  slug: 'element',
  labels: { singular: 'Element', plural: 'Elements' },
  fields: [
    {
      name: 'elementType',
      type: 'text',
      required: true,
      admin: {
        description: 'Which element this is (heading, icon box, countdown, ...). Set by the element library, not edited by hand.',
      },
    },
    {
      name: 'props',
      type: 'json',
      label: 'Content',
      admin: {
        description: "This element's own content fields. Edit on the drag-and-drop canvas via \"Edit visually\" - this raw view is an escape hatch.",
      },
      hooks: {
        beforeChange: [upgradeRepeaterFormats],
      },
    },
    blockStyleField,
  ],
}
