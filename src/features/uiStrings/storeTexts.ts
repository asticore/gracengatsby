/**
 * Storefront interface text: the `store.*` keys, the site owner's overrides, and
 * the plain dictionary handed to the browser. Edge-safe: no node or db imports.
 * The server reader is in storeTextsServer.ts.
 */

import { UI_STRING_SOURCE, type UiDictionary, type UiStringKey } from './keys'
import { fallbackChain, translateWith } from './t'

export const STORE_STRING_KEYS = Object.keys(UI_STRING_SOURCE).filter((key) => key.startsWith('store.')) as UiStringKey[]

/** One owner wording: the storefront key, the language it applies to, and the text to show. */
export type InterfaceOverride = { key: string; locale: string; value: string }

/** Keeps only well-formed `store.*` entries with text. Anything else in the stored JSON is ignored. */
export function parseInterfaceOverrides(raw: unknown): InterfaceOverride[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const out: InterfaceOverride[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const { key, locale, value } = item as Record<string, unknown>
    if (typeof key !== 'string' || typeof locale !== 'string' || typeof value !== 'string') continue
    if (!key.startsWith('store.') || !value.trim()) continue
    out.push({ key, locale: locale.trim(), value: value.trim().slice(0, 500) })
  }
  return out
}

/** The owner's wording for one key: the exact locale first, then its base language. Undefined when there is none. */
export function overrideFor(overrides: InterfaceOverride[], key: string, locale: string | null | undefined): string | undefined {
  const [primary] = fallbackChain(locale)
  for (const candidate of [locale?.trim(), primary]) {
    if (!candidate) continue
    const hit = overrides.find((o) => o.key === key && o.locale === candidate)
    if (hit) return hit.value
  }
  return undefined
}

/**
 * The storefront dictionary for one locale: every `store.*` key, with the
 * owner's overrides applied over the built-in translation. Plain object, so a
 * server component can pass it to the client provider.
 */
export function storeDictionary(
  dict: Partial<UiDictionary>,
  overrides: InterfaceOverride[],
  locale: string | null | undefined,
): Partial<UiDictionary> {
  const out: Partial<UiDictionary> = {}
  for (const key of STORE_STRING_KEYS) out[key] = overrideFor(overrides, key, locale) ?? translateWith(dict, key)
  return out
}
