/**
 * Engine seam: the rich-text editor factory used in `richText` field configs.
 *
 * There is no vendor editor any more. The admin edits rich text as raw
 * editor-state JSON, and read/write/validate/render are this app's own code
 * (`@/localapi/richtext`, `@/localapi/validators`), none of which reads
 * anything off the field's `editor` value. This factory therefore returns an
 * `undefined`, so `editor: richTextEditor()` in a field config stays a
 * valid, self-documenting declaration.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */
export const richTextEditor = (): undefined => undefined
