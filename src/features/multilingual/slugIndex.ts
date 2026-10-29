import { cache } from 'react'
import { permanentRedirect } from 'next/navigation'

import { getEngine } from '@/lib/engine'
import { requestHost } from '@/features/domains/request'
import { availableOnHost } from '@/features/domains/scope'
import { getAllResolvedPages } from '@/utilities/pagePaths'

import { isLocaleRoutable } from './routing'
import { localisedHref } from './detect'
import { nonDefaultLocales, publishIndex } from './availability'
import { loadLocaleRows } from './localeRows'
import { readMultilingualSettingsFromD1 } from './settings'
import {
  EMPTY_SLUG_INDEX,
  SLUG_FIELD,
  SLUG_PREFIX,
  buildSlugIndex,
  docIdOf,
  normaliseRoutePath,
  routeLocalizedPath,
  slugMapFor,
  type LocaleSlugIndex,
} from './localizedSlugs'

/**
 * The server half of translated slugs: builds, once per request and locale, the
 * table of source paths and their translated paths (localizedSlugs.ts holds the
 * rules). Every consumer goes through here: the public loaders, the link
 * rewriting, the SEO alternates and canonicals, and the language switcher.
 *
 * A site with no translated slugs in a locale gets EMPTY_SLUG_INDEX after one
 * read of the locale's rows, so its URLs, links and metadata are unchanged.
 */

/** Where a request for a non-default locale is sent: rendered as a source document, or redirected to its translated URL. */
export type SlugRoute = { kind: 'translated'; sourcePath: string } | { kind: 'redirect'; location: string } | null

export const loadLocaleSlugIndex = cache(async (locale: string): Promise<LocaleSlugIndex> => {
  const rows = (await loadLocaleRows(locale)).filter(
    (row) => row.fieldPath === SLUG_FIELD && typeof row.value === 'string' && row.value.trim().length > 0,
  )
  if (rows.length === 0) return EMPTY_SLUG_INDEX

  const wanted = new Set(rows.map((row) => row.sourceId))
  const docIdByPath = new Map<string, string>()
  const docs: Array<{ sourceId: string; slug: string }> = []

  // Pages: every published page on this domain is needed, because a translated parent changes its children's paths.
  for (const { page, path } of await getAllResolvedPages()) {
    const sourceId = docIdOf('pages', page.id)
    docIdByPath.set(`/${path.join('/')}`, sourceId)
    if (wanted.has(sourceId)) docs.push({ sourceId, slug: String(page.slug ?? '') })
  }

  // Posts and products: only the ones with a translated slug, under their blog/shop prefix.
  const host = await requestHost()
  const engine = await getEngine()
  for (const collection of ['posts', 'products'] as const) {
    const ids = rows
      .filter((row) => row.sourceId.startsWith(`${collection}:`))
      .map((row) => row.sourceId.slice(collection.length + 1))
    if (ids.length === 0) continue
    const { docs: found } = await engine.find({
      collection,
      where: { and: [{ id: { in: ids } }, { _status: { equals: 'published' } }] },
      limit: 0,
      depth: 0,
    })
    for (const doc of found as Array<{ id: string | number; slug?: unknown; availableDomains?: unknown }>) {
      if (typeof doc.slug !== 'string' || !doc.slug) continue
      if (!availableOnHost(doc.availableDomains, host)) continue
      const sourceId = docIdOf(collection, doc.id)
      docIdByPath.set(`/${SLUG_PREFIX[collection]}/${doc.slug}`, sourceId)
      docs.push({ sourceId, slug: doc.slug })
    }
  }

  const settings = await readMultilingualSettingsFromD1()
  const slugs = slugMapFor({ locale, index: publishIndex(rows), settings, docs })
  return buildSlugIndex(docIdByPath, slugs)
})

/** Multilingual applies to this locale: routable site, a non-default active locale. */
async function localeOf(locale: string | null | undefined) {
  if (!locale) return null
  const settings = await readMultilingualSettingsFromD1()
  if (!isLocaleRoutable(settings)) return null
  if (locale === settings.defaultLocale || !settings.activeLocales.includes(locale)) return null
  return settings
}

/**
 * How a request path in `locale` is served (see SlugRoute). Null for the default
 * locale, multilingual off, or a path with no translated slug involved.
 */
export async function routeLocalizedRequest(locale: string | null | undefined, path: string): Promise<SlugRoute> {
  const settings = await localeOf(locale)
  if (!settings || !locale) return null
  const route = routeLocalizedPath(normaliseRoutePath(path), await loadLocaleSlugIndex(locale))
  if (!route) return null
  if (route.kind === 'translated') return route
  return { kind: 'redirect', location: localisedHref(route.translatedPath, locale, settings) }
}

/**
 * The translated path of a source path for every non-default locale that has
 * one, keyed by locale. Null when nothing differs, so callers keep the plain
 * source URLs (and their existing markup) on untranslated sites.
 */
export async function localizedPathsFor(sourcePath: string): Promise<Record<string, string> | undefined> {
  const settings = await readMultilingualSettingsFromD1()
  if (!isLocaleRoutable(settings)) return undefined
  const path = normaliseRoutePath(sourcePath)
  const out: Record<string, string> = {}
  for (const locale of nonDefaultLocales(settings)) {
    const translated = (await loadLocaleSlugIndex(locale)).toTranslated.get(path)
    if (translated !== undefined) out[locale] = translated
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * The source path behind a path as it appears in `locale` (identity when the
 * path is already a source path). Used where only the URL is known.
 */
export async function sourcePathFor(locale: string | null | undefined, path: string): Promise<string> {
  const route = await routeLocalizedRequest(locale, path)
  return route?.kind === 'translated' ? route.sourcePath : normaliseRoutePath(path)
}

/**
 * A source path for a path that may be translated in any non-default locale
 * (SEO asks about a path without knowing the language it was requested in).
 */
export async function sourcePathFromAnyLocale(path: string): Promise<string> {
  const settings = await readMultilingualSettingsFromD1()
  if (!isLocaleRoutable(settings)) return normaliseRoutePath(path)
  const normal = normaliseRoutePath(path)
  for (const locale of nonDefaultLocales(settings)) {
    const route = routeLocalizedPath(normal, await loadLocaleSlugIndex(locale))
    if (route?.kind === 'translated') return route.sourcePath
  }
  return normal
}

/** Source path to translated path, for every path the locale's links may point at (menus, blocks, cards). */
export async function localeLinkPaths(locale: string | null | undefined): Promise<ReadonlyMap<string, string> | null> {
  const settings = await localeOf(locale)
  if (!settings || !locale) return null
  const index = await loadLocaleSlugIndex(locale)
  return index.toTranslated.size > 0 ? index.toTranslated : null
}

/**
 * The source slug of a post or product requested as `/<prefix>/<slug>` in
 * `locale`. With `redirect`, a source slug that has a translation is sent to the
 * translated URL (permanently) instead of being served.
 */
export async function sourceSlugFor(
  locale: string | null | undefined,
  prefix: string,
  slug: string,
  { redirect }: { redirect: boolean },
): Promise<string> {
  const route = await routeLocalizedRequest(locale, `/${prefix}/${slug}`)
  if (redirect && route?.kind === 'redirect') permanentRedirect(route.location)
  if (route?.kind === 'translated') return route.sourcePath.slice(prefix.length + 2)
  return slug
}
