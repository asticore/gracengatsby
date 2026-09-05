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
