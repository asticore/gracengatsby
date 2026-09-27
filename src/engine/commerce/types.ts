/**
 * Engine seam: shop types.
 *
 * Was `export type { Currency } from '@payloadcms/plugin-ecommerce/types'`.
 * Removed 2026-09-27 (payload-removal-plan.md, What's-left item 3 - the last
 * of `@payloadcms/plugin-ecommerce`'s client/hook surface). The only
 * consumer, `src/lib/currencies.ts`'s `AUD` constant, only ever needed the
 * four fields below - reproduced here so this app no longer imports
 * anything from the plugin's `types` entrypoint at all.
 *
 * See ./react.tsx for what this directory is and the rules that govern it.
 */
export type Currency = {
  code: string
  decimals: number
  label: string
  symbol: string
}
