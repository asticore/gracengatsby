import { cache } from 'react'
import { headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { LOCALE_HEADER, isLocaleRoutable, requestLocale } from './routing'
import { nonDefaultLocales, publishIndex, publishableLocalesForDocument } from './availability'
import { sourceIdFor } from './translatableFields'
import { findPageByPath, getHomepage } from '@/utilities/pagePaths'
import { readMultilingualSettingsFromD1, type MultilingualSettings } from './settings'
import { lookupFromRows, overlayDocument } from './overlay'
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

  const rows = await loadLocaleRows(ctx.locale)
  return overlayDocument(doc, collection, id, lookupFromRows(ctx.locale, rows, ctx.settings), ctx.settings.fallbackToDefault)
}

/** Applies translations to a list. Loads the locale once, however long the list. */
export async function applyTranslationsToDocs<T>(docs: T[], collection: string, locale: string | null | undefined): Promise<T[]> {
  const ctx = await translatableContext(locale)
  if (!ctx) return docs
  const rows = await loadLocaleRows(ctx.locale)
  const lookup = lookupFromRows(ctx.locale, rows, ctx.settings)
  return docs.map((doc) => {
    const id = doc && typeof doc === 'object' ? (doc as { id?: string | number }).id : undefined
    if (id === undefined || id === null) return doc
    return overlayDocument(doc, collection, id, lookup, ctx.settings.fallbackToDefault)
  })
}

// --- Which locales a page can be offered in ---------------------------------

const SLUG_COLLECTIONS: Record<string, string> = { blog: 'posts', shop: 'products', events: 'events' }

/** One query per document and request: the document's rows in every non-default active locale. */
const loadDocumentRows = cache(async (sourceId: string, locales: string): Promise<TranslationRow[]> => {
  const engine = await getEngine()
  return findTranslations(engine as unknown as Parameters<typeof findTranslations>[0], {
    locales: locales.split(','),
    sourceKind: 'collection',
    sourceId,
  })
})

/**
 * The document a public path shows: a page, the homepage, or a blog post,
 * product or event by slug. Null for listing and interface-only routes.
 */
async function documentForPath(path: string): Promise<{ collection: string; id: string | number; doc: unknown } | null> {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) {
    const home = await getHomepage()
    return home ? { collection: 'pages', id: home.id, doc: home } : null
  }
  const page = await findPageByPath(segments)
  if (page) return { collection: 'pages', id: page.page.id, doc: page.page }

  const collection = segments.length === 2 ? SLUG_COLLECTIONS[segments[0] ?? ''] : undefined
  if (!collection || !segments[1]) return null
  const engine = await getEngine()
  const { docs } = await engine.find({
    collection: collection as 'posts',
    where: { slug: { equals: segments[1] }, _status: { equals: 'published' } },
    limit: 1,
    depth: 0,
  })
  const doc = docs[0] as { id?: string | number } | undefined
  return doc?.id !== undefined ? { collection, id: doc.id, doc } : null
}

/**
 * The non-default active locales that have a publishable translation of the
 * document at `path`. Null when multilingual does not apply or the route is
 * not tied to a translatable document; callers then keep every locale. Never
 * throws: a failed lookup keeps every locale rather than breaking the page.
 */
export async function availableLocalesForPath(path: string | null | undefined): Promise<string[] | null> {
  try {
    const settings = await readMultilingualSettingsFromD1()
    if (!isLocaleRoutable(settings)) return null
    const target = await documentForPath(path ?? '/')
    if (!target) return null
    const locales = nonDefaultLocales(settings)
    if (locales.length === 0) return null
    const rows = await loadDocumentRows(sourceIdFor(target.collection, target.id), locales.join(','))
    return publishableLocalesForDocument({ ...target, index: publishIndex(rows), settings })
  } catch {
    return null
  }
}
