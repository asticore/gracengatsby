/**
 * Fixed interface text for the logged-in portal.
 *
 * The strings now live in the shared reference table
 * (`src/features/uiStrings/keys.ts`, `portal.*` keys), the same mechanism the
 * admin uses. This module keeps the portal's own call shape, so the account
 * screens did not change.
 *
 * Portal strings are held in English in every dictionary until the portal is
 * translated, so output is unchanged. Any other language falls back to English.
 */

import { t, type UiStringVars } from '@/features/uiStrings/t'
import { portalKey, type PortalStringKey } from '@/features/uiStrings/portalAdapter'

export type { PortalStringKey }

export function portalText(key: PortalStringKey, locale: string | null | undefined, vars?: UiStringVars): string {
  return t(portalKey(key), locale, vars)
}

/** `portalText` bound to one request's language, for screens that translate many strings. */
export const portalTextFor =
  (locale: string | null | undefined) =>
  (key: PortalStringKey, vars?: UiStringVars): string =>
    portalText(key, locale, vars)
