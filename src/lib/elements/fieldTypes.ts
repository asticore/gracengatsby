/**
 * Shared field-schema shape for both the page-builder block library
 * (src/views/visualEditor/blockSchemas.ts) and the per-element-type registry
 * (src/lib/elements/registry.ts). Pulled out to its own file so the registry
 * doesn't have to import from a views/ module to get the type.
 */

export type EditorFieldType =
  | 'text'
  | 'textarea'
  | 'richText'
  | 'number'
  | 'checkbox'
  | 'select'
  | 'color'
  | 'media'
  | 'mediaMulti'
  | 'relationship'
  /** Form builder: an editable list of label / value / price rows (src/features/forms/editor). */
  | 'formOptions'
  /** Form builder: the conditional-logic rule builder. Reads the other fields from FormEditorContext. */
  | 'formLogic'
  /** Repeater: array of objects, each with fields defined in the repeater config. */
  | 'repeater'
  /** Link field: URL input with new tab and nofollow toggles. Output: {url, newTab?, nofollow?}. */
  | 'link'
  /** Icon picker: FontAwesome Free icons (Output: {icon: "fa-solid fa-..."}), or the built-in set when iconSet is 'builtin' (Output: "star"). */
  | 'icon'
  /** Range slider: number input with draggable slider. */
  | 'range'
  /** Dimensions field: four linked/unlinked inputs for top/right/bottom/left values. */
  | 'dimensions'
  /** Typography popover: family, size, weight, line height, letter spacing. */
  | 'typography'
  /** Shadow popover: offsetX, offsetY, blur, spread, color, opacity. */
  | 'shadow'
  /** Gradient editor: type, angle, color stops. */
  | 'gradient'

/**
 * Conditional visibility: the field shows only when the sibling prop named by `field` matches.
 * `equals` is compared as a string (String(value) === String(equals)); `in` matches any listed string.
 * With neither set the field is always visible.
 */
export type ShowIf = { field: string; equals?: string | boolean; in?: string[] }

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
  /** For repeater fields: the shape of each item in the array. */
  repeater?: { fields: EditorField[] }
  /** For range fields: minimum value. */
  min?: number
  /** For range fields: maximum value. */
  max?: number
  /** For range fields: step value. */
  step?: number
  /** For icon fields: 'builtin' picks from the inline SVG set in src/components/blocks/elements/icons.tsx and stores the plain name. */
  iconSet?: 'builtin'
  /** Hide this field unless a sibling prop matches. Hidden values stay stored. See isFieldVisible. */
  showIf?: ShowIf
}

/** True when the field should render for these prop values. Values are compared as strings. */
export function isFieldVisible(field: EditorField, values: Record<string, unknown>): boolean {
  const rule = field.showIf
  if (!rule) return true
  const actual = String(values[rule.field])
  if (rule.equals !== undefined && actual !== String(rule.equals)) return false
  if (rule.in !== undefined && !rule.in.includes(actual)) return false
  return true
}
