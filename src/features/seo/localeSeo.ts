import { localisedHref } from '@/features/multilingual/detect'
import { isLocaleRoutable } from '@/features/multilingual/routing'
import type { MultilingualSettings } from '@/features/multilingual/settings'

/**
 * Pure locale-SEO rules: hreflang alternates, self-referencing canonicals,
 * Open Graph locale tags and sitemap variants. No I/O and no node-only
 * imports, so the sitemap, the metadata builders and the tests share one rule set.
 *
 * Every function here answers "nothing to add" (null, or the input unchanged)
 * unless multilingual routing is on with at least two active locales, so a
 * single-language site keeps exactly the markup it had before.
 */

export type Alternate = { hreflang: string; href: string }

/** Territory used for og:locale when the language tag has no region subtag. */
const OG_TERRITORY: Record<string, string> = {
  ar: 'SA', da: 'DK', de: 'DE', en: 'US', es: 'ES', fi: 'FI', fr: 'FR', hi: 'IN', it: 'IT',
  ja: 'JP', ko: 'KR', nb: 'NO', nl: 'NL', pl: 'PL', pt: 'PT', ru: 'RU', sv: 'SE', tr: 'TR', zh: 'CN',
}

/** BCP 47 tag to Open Graph `language_TERRITORY`. Script subtags (zh-Hans) fall back to the language's territory. */
export function ogLocale(code: string): string {
  const [language = '', region = ''] = code.split('-')
  const lang = language.toLowerCase()
  const territory = region.length === 2 ? region.toUpperCase() : OG_TERRITORY[lang]
  return territory ? `${lang}_${territory}` : lang
}

/**
 * Absolute URL of a site path in one locale. The default locale stays unprefixed.
 * `localizedPaths` gives the translated path of this document per locale (see
 * localizedSlugs.ts); a locale without one uses the source path.
 */
export function localeUrl(
  baseUrl: string,
  path: string,
  locale: string,
  settings: MultilingualSettings,
  localizedPaths?: Readonly<Record<string, string>> | null,
): string {
  return `${baseUrl}${localisedHref(normalisePath(localizedPaths?.[locale] ?? path), locale, settings)}`
}

const normalisePath = (path: string): string => (!path ? '/' : path.startsWith('/') ? path : `/${path}`)

/**
 * The locales offered for a page: every active locale, or only the default
 * plus the non-default locales that have a publishable translation of the page
 * (`available`). The default locale is always kept.
 */
export function localesFor(settings: MultilingualSettings, available?: readonly string[] | null): string[] {
  if (!available) return settings.activeLocales
  return settings.activeLocales.filter((code) => code === settings.defaultLocale || available.includes(code))
}

/**
 * Every offered locale's URL for a path, plus `x-default` pointing at the
 * default-locale URL. Null when multilingual does not apply.
 */
export function hreflangAlternates(
  path: string,
  baseUrl: string,
  settings: MultilingualSettings,
  available?: readonly string[] | null,
  localizedPaths?: Readonly<Record<string, string>> | null,
): Alternate[] | null {
  if (!isLocaleRoutable(settings)) return null
  const alternates = localesFor(settings, available).map((locale) => ({
    hreflang: locale,
    href: localeUrl(baseUrl, path, locale, settings, localizedPaths),
  }))
  const fallback = alternates.find((alt) => alt.hreflang === settings.defaultLocale)
  if (fallback) alternates.push({ hreflang: 'x-default', href: fallback.href })
  return alternates
}

/** The hreflang list as a `languages` map, the shape Next's `alternates` takes. */
export function languagesMap(alternates: Alternate[]): Record<string, string> {
  return Object.fromEntries(alternates.map((alt) => [alt.hreflang, alt.href]))
}

/**
 * SEO fields for a page rendered in `locale`. `canonical` is omitted when the
 * page sets its own canonical, so that override keeps winning.
 */
export function localeSeoFields(input: {
  baseUrl: string
  path: string
  locale: string
  settings: MultilingualSettings
  explicitCanonical: boolean
  /** Non-default locales with a publishable translation of this page; null keeps all. */
  available?: readonly string[] | null
  /** Translated path of this page per locale (localizedSlugs.ts). */
  localizedPaths?: Readonly<Record<string, string>> | null
}): { canonical?: string; alternates: Alternate[]; ogLocale: string; ogAlternateLocales: string[] } | null {
  const { baseUrl, path, locale, settings, explicitCanonical, available, localizedPaths } = input
  const alternates = hreflangAlternates(path, baseUrl, settings, available, localizedPaths)
  if (!alternates) return null
  return {
    canonical: explicitCanonical ? undefined : localeUrl(baseUrl, path, locale, settings, localizedPaths),
    alternates,
    ogLocale: ogLocale(locale),
    ogAlternateLocales: localesFor(settings, available).filter((code) => code !== locale).map(ogLocale),
  }
}

export type SitemapVariant = { url: string; alternates?: Alternate[] }

/**
 * One sitemap entry per offered locale for a single normalised site path. With
 * multilingual off this is the single unprefixed URL, with no alternates.
 */
export function sitemapVariants(
  path: string,
  baseUrl: string,
  settings: MultilingualSettings,
  available?: readonly string[] | null,
  localizedPaths?: Readonly<Record<string, string>> | null,
): SitemapVariant[] {
  const alternates = hreflangAlternates(path, baseUrl, settings, available, localizedPaths)
  if (!alternates) return [{ url: localeUrl(baseUrl, path, settings.defaultLocale, settings, localizedPaths) }]
  return localesFor(settings, available).map((locale) => ({
    url: localeUrl(baseUrl, path, locale, settings, localizedPaths),
    alternates,
  }))
}
