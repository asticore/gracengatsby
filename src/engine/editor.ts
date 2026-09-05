/**
 * Engine seam: the rich-text editor, server side.
 *
 * Used by the config and by any field or block that declares a rich-text
 * field. Consumers only ever call the factory - they never reach into the
 * editor's node types - which keeps this a narrow contract to reimplement or
 * swap for a different editor later.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export { lexicalEditor as richTextEditor } from '@payloadcms/richtext-lexical'

/** Deprecated vendor-named alias - call sites move to `richTextEditor`. */
export { lexicalEditor } from '@payloadcms/richtext-lexical'
