import { UI_STRING_SOURCE, type UiDictionary, type UiStringKey } from './keys'
import {
  DEFAULT_ADMIN_UI_LOCALE,
  findAdminUiLocale,
  type AdminUiLocale,
  ADMIN_UI_LOCALES,
} from './locales'
import { DICTIONARY_LOADERS } from './loaders'

/**
 * Admin UI text lookup.
 *
 * Fallback chain for a requested locale, first hit wins:
 *
 *   exact supported locale -> its base language -> en
 *
 * `fr-CA` therefore reads `fr`, `de-AT` reads `de`, and anything unsupported
 * reads English. A key missing from a dictionary also falls back to English,
 * one key at a time, so a half-finished translation never shows a raw key.
 *
 * Two entry points:
 *   - `loadStrings(locale)` (async, server or client): loads one locale's
 *     dictionary and returns it merged over English. Pass the result down.
 *   - `t(key, locale)` (sync): reads the dictionaries already loaded with
 *     `loadStrings`. English is always loaded, so `t` never returns a raw key
 *     for a valid key. A locale that was not loaded reads English.
 *
 * Never store these in eg_translations. They are code, not content.
 */

/** Raw dictionaries as written: a locale's own entries only, no English filled in. */
const raw = new Map<AdminUiLocale, Partial<UiDictionary>>([['en', UI_STRING_SOURCE]])

/** The locales to try, in order, for a requested tag. Always ends with `en`. */
export function fallbackChain(requested: string | null | undefined): AdminUiLocale[] {
  const exact = findAdminUiLocale(requested)
  if (exact) return exact === DEFAULT_ADMIN_UI_LOCALE ? [exact] : [exact, DEFAULT_ADMIN_UI_LOCALE]

  const base = requested?.trim().toLowerCase().split('-')[0]
  const byBase = base ? ADMIN_UI_LOCALES.find((code) => code.toLowerCase() === base) : undefined
  if (byBase && byBase !== DEFAULT_ADMIN_UI_LOCALE) return [byBase, DEFAULT_ADMIN_UI_LOCALE]
  return [DEFAULT_ADMIN_UI_LOCALE]
}

/**
 * The locale's own entries, exactly as the dictionary file has them. Used by the
 * Interface languages page, which must tell a real translation from a missing one.
 * Resolves to the English table for `en` and for anything unsupported.
 */
export async function loadRawStrings(
  requested: string | null | undefined,
): Promise<Partial<UiDictionary>> {
  const [primary = DEFAULT_ADMIN_UI_LOCALE] = fallbackChain(requested)
  const cached = raw.get(primary)
  if (cached) return cached

  const mod = await DICTIONARY_LOADERS[primary as Exclude<AdminUiLocale, 'en'>]()
  raw.set(primary, mod.default)
  return mod.default
}

/**
 * Loads the dictionary for a locale and returns it with English filled in for
 * any missing key. This is what pages pass down to their components.
 */
export async function loadStrings(requested: string | null | undefined): Promise<UiDictionary> {
  const own = await loadRawStrings(requested)
  return { ...UI_STRING_SOURCE, ...own }
}

/** Values for `{name}` placeholders in a string. Numbers are written as-is. */
export type UiStringVars = Record<string, string | number>

/**
 * Fills `{name}` placeholders from `vars`. A placeholder with no value is left
 * as written, so a missing variable shows up visibly instead of silently
 * disappearing. Placeholders are the only interpolation: translators move them
 * within a sentence, and no translated fragment is ever concatenated in code.
 */
export function interpolate(text: string, vars?: UiStringVars): string {
  if (!vars) return text
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  )
}

/** Sync lookup of one key. Reads whatever `loadStrings` has already loaded, then English. */
export function t(key: UiStringKey, locale?: string | null, vars?: UiStringVars): string {
  for (const code of fallbackChain(locale)) {
    const dict = raw.get(code)
    const value = dict?.[key]
    if (typeof value === 'string' && value.length > 0) return interpolate(value, vars)
  }
  return interpolate(UI_STRING_SOURCE[key] ?? key, vars)
}

/** Resolve one key against an already-loaded dictionary, falling back to English. */
export function translateWith(
  dict: Partial<UiDictionary> | null | undefined,
  key: UiStringKey,
  vars?: UiStringVars,
): string {
  const value = dict?.[key]
  const text = typeof value === 'string' && value.length > 0 ? value : UI_STRING_SOURCE[key]
  return interpolate(text, vars)
}
