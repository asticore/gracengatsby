/**
 * Engine seam: the rich-text renderer used by the public site.
 *
 * One component, rendering stored rich-text content to React. Deliberately
 * separate from ../editor.ts: this half ships to the frontend bundle, the
 * other half is server-side config, and they will not necessarily be replaced
 * at the same time.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 *
 * Payload removal, Rich Text stage: this used to re-export
 * `@payloadcms/richtext-lexical/react`'s own `RichText`. It's now our own
 * from-scratch port (`@/localapi/richtext`), verified byte-for-byte
 * equivalent to the real component for this app's actual usage - see
 * `tests/int/localapi-richtext-parity.int.spec.ts` and
 * `payload-removal-plan.md`'s "Rich text" section. `../editor.ts` (the admin
 * *editing* UI's `richTextEditor`/`lexicalEditor` factory) is untouched and
 * still real Payload - only the frontend read-side renderer changes here.
 */

export { RichText } from '@/localapi/richtext'
