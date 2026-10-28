/**
 * Public surface of the admin UI reference table. Edge-safe: nothing here
 * imports node or db modules.
 *
 *   keys.ts        keys and English source (the reference table)
 *   dictionaries/  one file per non-English admin language
 *   locales.ts     supported languages, rtl, per-user resolution
 *   t.ts           loadStrings, t(key, locale), fallback chain
 */

export * from './keys'
export * from './locales'
export { loadStrings, loadRawStrings, t, translateWith, fallbackChain } from './t'
export { DICTIONARY_LOADERS } from './loaders'
export { portalKey, type PortalStringKey } from './portalAdapter'
