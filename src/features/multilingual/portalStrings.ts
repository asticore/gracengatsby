/**
 * Fixed interface text for the logged-in portal.
 *
 * The strings live in the shared reference table (`src/features/uiStrings/keys.ts`,
 * `portal.*` keys), the same mechanism the admin uses. Every portal screen reads
 * them through this module:
 *
 *   - Server components call `loadPortalTexts(locale)` once, then `tx(key, vars)`,
 *     or `portalTextFor(locale)` where a screen already has the locale.
 *   - Client components read the same strings through `PortalTextProvider` and
 *     `usePortalText()` (accounts/components/PortalText.tsx).
 *
 * English is always the fallback, so an untranslated key never shows a raw key.
 */

import { loadStrings, t, translateWith, type UiStringVars } from '@/features/uiStrings'
import { portalKey, type PortalStringKey } from '@/features/uiStrings/portalAdapter'

export type { PortalStringKey }
export type { UiStringVars }

/** The portal's own strings for one locale, keyed by full `portal.*` key. Plain data, safe to pass to the browser. */
export type PortalDictionary = Record<string, string>

/** `tx('auth.signIn')` or `tx('account.hello', { name })`, bound to one locale's dictionary. */
export type PortalTexts = {
  (key: PortalStringKey, vars?: UiStringVars): string
  readonly dictionary: PortalDictionary
}

/**
 * Loads one locale's dictionary and returns a bound lookup. Use this from server
 * components and server actions. Unsupported or null locales read English.
 */
export async function loadPortalTexts(locale: string | null | undefined): Promise<PortalTexts> {
  const dict = await loadStrings(locale)
  const dictionary: PortalDictionary = {}
  for (const [key, value] of Object.entries(dict)) {
    if (key.startsWith('portal.') && typeof value === 'string') dictionary[key] = value
  }
  const text = (key: PortalStringKey, vars?: UiStringVars): string => translateWith(dict, portalKey(key), vars)
  return Object.assign(text, { dictionary })
}

/**
 * Sync lookup against a dictionary already loaded with `loadStrings` (or
 * `loadPortalTexts`). `currentPortalLocale` loads the visitor's language, so
 * screens that call it first can use this directly.
 */
export function portalText(key: PortalStringKey, locale: string | null | undefined, vars?: UiStringVars): string {
  return t(portalKey(key), locale, vars)
}

/** `portalText` bound to one request's language, for screens that translate many strings. */
export const portalTextFor =
  (locale: string | null | undefined) =>
  (key: PortalStringKey, vars?: UiStringVars): string =>
    portalText(key, locale, vars)
