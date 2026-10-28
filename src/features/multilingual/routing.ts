import { localisedHref } from './detect'
import type { MultilingualSettings } from './settings'

/**
 * Locale-prefixed URLs, decided without any I/O so the edge middleware and the
 * tests share one rule set.
 *
 * No [locale] route segment: the app keeps its single route tree. The middleware
 * strips a non-default prefix (`/fr/about` is served by `/about` with the locale
 * passed in a request header), and the default language is never prefixed
 * (`/en/about` redirects to `/about`).
 */

/** Request header carrying the resolved locale into the app. Always set by the middleware, never trusted from the client. */
export const LOCALE_HEADER = 'x-eg-locale'

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Paths that are never locale-prefixed. */
const RESERVED_SEGMENTS = ['admin', 'api', '_next', 'preview']

export type LocaleRoute =
  /** Not a locale URL (or multilingual is off): leave the request alone. */
  | { kind: 'none' }
  /** A non-default locale prefix: serve `rest` with the locale header set. */
  | { kind: 'strip'; locale: string; rest: string }
  /** The default locale's own prefix: permanent redirect to the unprefixed path. */
  | { kind: 'default'; location: string }

/** True when locale routing applies at all. A single-language site never routes. */
export function isLocaleRoutable(settings: MultilingualSettings): boolean {
  return settings.enabled && settings.activeLocales.length >= 2
}

/** Exact, case-insensitive match of a URL segment against the active locales. */
function prefixLocale(segment: string, settings: MultilingualSettings): string | null {
  const wanted = segment.toLowerCase()
  if (!wanted) return null
  return settings.activeLocales.find((code) => code.toLowerCase() === wanted) ?? null
}

export function routeLocale(pathname: string, settings: MultilingualSettings): LocaleRoute {
  if (!isLocaleRoutable(settings)) return { kind: 'none' }

  const [, first = '', ...others] = pathname.split('/')
  const locale = prefixLocale(first, settings)
  if (!locale) return { kind: 'none' }

  const rest = `/${others.join('/')}`
  const inner = others[0]?.toLowerCase() ?? ''
  // The app's own paths, and anything that looks like a file (sitemap.xml, llms.txt, images), keep their URLs.
  if (RESERVED_SEGMENTS.includes(inner)) return { kind: 'none' }
  const last = others[others.length - 1] ?? ''
  if (last.includes('.')) return { kind: 'none' }

  if (locale === settings.defaultLocale) return { kind: 'default', location: rest }
  return { kind: 'strip', locale, rest }
}

/**
 * The locale a page should render in, from the header the middleware set.
 * Null when multilingual is off, so the layout keeps its single-language output.
 */
export function requestLocale(headerValue: string | null | undefined, settings: MultilingualSettings): string | null {
  if (!isLocaleRoutable(settings)) return null
  const requested = headerValue ? prefixLocale(headerValue, settings) : null
  return requested ?? settings.defaultLocale
}

/** Paths that cache under one page: the path itself plus each non-default locale's prefixed copy. */
export function localeVariantPaths(path: string, settings: MultilingualSettings): string[] {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (!isLocaleRoutable(settings)) return [clean]
  const variants = settings.activeLocales
    .filter((code) => code !== settings.defaultLocale)
    .map((code) => localisedHref(clean, code, settings))
  return Array.from(new Set([clean, ...variants]))
}

/** Absolute URLs expanded to their locale variants, for cache purges. Unparseable entries pass through unchanged. */
export function localeVariantUrls(urls: string[], settings: MultilingualSettings): string[] {
  if (!isLocaleRoutable(settings)) return urls
  const out: string[] = []
  for (const value of urls) {
    try {
      const url = new URL(value)
      for (const path of localeVariantPaths(url.pathname, settings)) out.push(`${url.origin}${path}`)
    } catch {
      out.push(value)
    }
  }
  return Array.from(new Set(out))
}
