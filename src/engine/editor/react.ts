/**
 * Engine seam: the rich-text renderer used by the public site.
 *
 * One component, rendering stored rich-text content to React. Deliberately
 * separate from ../editor.ts: this half ships to the frontend bundle, the
 * other half is server-side config, and they will not necessarily be replaced
 * at the same time.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 */

export { RichText } from '@payloadcms/richtext-lexical/react'
