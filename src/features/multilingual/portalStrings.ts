/**
 * Fixed interface text for the logged-in portal.
 *
 * The strings live in the shared reference table (`src/features/uiStrings/keys.ts`,
 * `portal.*` keys), the same mechanism the admin uses. Every portal screen reads
 * them through this module:
 *
 *   - Server components call `loadPortalTexts(locale)` once, then `tx(key, vars)`.
 *   - Client components read the same dictionary through `PortalTextProvider`
 *     and `usePortalText()` (see `PortalTextProvider.tsx`).
 *
 * English is always the fallback, so an untranslated key never shows a raw key.
 */

import { loadStrings, translateWith, t, type UiStringVars } from '@/features/uiStrings'
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
 * `loadPortalTexts`). Kept for callers that loaded the locale earlier.
 */
export function portalText(key: PortalStringKey, locale: string | null | undefined, vars?: UiStringVars): string {
  return t(portalKey(key), locale, vars)
}
