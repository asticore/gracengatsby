import { cache } from 'react'
import { headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { LOCALE_HEADER, isLocaleRoutable, requestLocale } from './routing'
import { readMultilingualSettingsFromD1, type MultilingualSettings } from './settings'
import { isTranslationPublishable, lookupFromRows, overlayDocument } from './overlay'
import { findTranslations, type TranslationRow } from './store'

/**
 * Server side of the overlay: loads the locale's rows once per request and
 * applies them to documents the public renderers are about to show.
 *
 * Off, single-language and default-locale requests return the input object
 * unchanged, so a site without translations renders exactly as before.
 */

/** One bulk read of a locale's collection rows, memoised for the request. */
const loadLocaleRows = cache(async (locale: string): Promise<TranslationRow[]> => {
  const engine = await getEngine()
  return findTranslations(engine as unknown as Parameters<typeof findTranslations>[0], {
    locale,
    sourceKind: 'collection',
  })
})

/** The locale the current request is served in, or null when multilingual is off. */
export async function currentRequestLocale(): Promise<string | null> {
  const settings = await readMultilingualSettingsFromD1()
  return requestLocale((await headers()).get(LOCALE_HEADER), settings)
}

async function translatableContext(locale: string | null | undefined): Promise<{ locale: string; settings: MultilingualSettings } | null> {
  if (!locale) return null
  const settings = await readMultilingualSettingsFromD1()
  if (!isLocaleRoutable(settings)) return null
  if (locale === settings.defaultLocale || !settings.activeLocales.includes(locale)) return null
  return { locale, settings }
}

/** Applies translations to one document. Identity outside a non-default locale. */
export async function applyTranslations<T>(doc: T, collection: string, locale: string | null | undefined): Promise<T> {
  const ctx = await translatableContext(locale)
  if (!ctx || !doc || typeof doc !== 'object') return doc
  const id = (doc as { id?: string | number }).id
  if (id === undefined || id === null) return doc

  const rows = (await loadLocaleRows(ctx.locale)).filter((row) => isTranslationPublishable(row, ctx.settings))
  return overlayDocument(doc, collection, id, lookupFromRows(ctx.locale, rows), ctx.settings.fallbackToDefault)
}

/** Applies translations to a list. Loads the locale once, however long the list. */
export async function applyTranslationsToDocs<T>(docs: T[], collection: string, locale: string | null | undefined): Promise<T[]> {
  const ctx = await translatableContext(locale)
  if (!ctx) return docs
  const rows = (await loadLocaleRows(ctx.locale)).filter((row) => isTranslationPublishable(row, ctx.settings))
  const lookup = lookupFromRows(ctx.locale, rows)
  return docs.map((doc) => {
    const id = doc && typeof doc === 'object' ? (doc as { id?: string | number }).id : undefined
    if (id === undefined || id === null) return doc
    return overlayDocument(doc, collection, id, lookup, ctx.settings.fallbackToDefault)
  })
}
