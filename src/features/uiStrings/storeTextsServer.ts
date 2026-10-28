import { headers } from 'next/headers'
import { cache } from 'react'

import { findLanguageSettings } from '@/cms/db/globals/languageSettings'
import { LOCALE_HEADER, requestLocale } from '@/features/multilingual/routing'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'

import { loadStrings } from './t'
import { parseInterfaceOverrides, storeDictionary, type InterfaceOverride } from './storeTexts'

/** The owner's interface-text overrides from Languages settings. Empty when unreadable, so the built-in text still shows. */
export async function readInterfaceOverrides(): Promise<InterfaceOverride[]> {
  try {
    const doc = (await findLanguageSettings()) as { interfaceOverrides?: unknown } | null
    return parseInterfaceOverrides(doc?.interfaceOverrides)
  } catch {
    return []
  }
}

/** The storefront text for one locale, overrides applied. */
export async function storeTextsFor(locale: string | null | undefined) {
  const dict = await loadStrings(locale)
  return storeDictionary(dict, await readInterfaceOverrides(), locale ?? null)
}

/**
 * The storefront text for the current public request. Multilingual off gives
 * English (no locale), so a site that never turns languages on sees what it saw before.
 */
export const storeTexts = cache(async () => {
  const settings = await readMultilingualSettingsFromD1()
  if (!settings.enabled) return storeTextsFor(null)
  const fromRequest = requestLocale((await headers()).get(LOCALE_HEADER), settings)
  return storeTextsFor(fromRequest ?? settings.defaultLocale)
})
