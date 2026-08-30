import { DEFAULT_LOCALE, findLocale } from './locales'
import type { MultilingualSettings } from './settings'

/**
 * Deciding which language a visitor gets.
 *
 * Order is explicit and, in order: the URL, then the cookie, then the browser,
 * then the site default. The URL wins because a link somebody shares has to
 * land everyone on the same page - if a stored preference could override the
 * path, a French visitor opening a colleague's German link would silently get
 * something else and neither of them would understand why.
 *
 * The cookie is only ever written when the visitor picks a language by hand,
 * so it means "I chose this", not "I once visited this".
 */

export const LOCALE_COOKIE = 'eg_locale'

export type LocaleDecision = {
  locale: string
  /** True when the request path carried the locale, so links must keep it. */
  fromPath: boolean
  /** Path with the locale segment removed - what the router should match on. */
  pathname: string
  source: 'path' | 'cookie' | 'header' | 'default'
}

/**
 * Case-folds a candidate onto a configured locale.
 *
 * URLs are lower-cased in the wild, so `/zh-hans/...` has to find `zh-Hans`,
 * and `Accept-Language` offers `en-au` for `en-AU`. Exact-matching either
 * would mean a switcher that works and a shared link that does not.
 */
function matchActive(candidate: string | null | undefined, active: string[]): string | null {
  if (!candidate) return null
  const wanted = candidate.trim().toLowerCase()
  if (!wanted) return null

  const exact = active.find((code) => code.toLowerCase() === wanted)
  if (exact) return exact

  // `fr-CH` requested, only `fr` offered: the base language is a better answer
  // than the site default.
  const base = wanted.split('-')[0]
  return active.find((code) => code.toLowerCase() === base || code.toLowerCase().startsWith(`${base}-`)) ?? null
}

/** Splits `/de/about` into its locale and the path the router should see. */
export function splitLocalePath(pathname: string, active: string[]): { locale: string | null; rest: string } {
  const [, first = '', ...others] = pathname.split('/')
  const matched = matchActive(first, active)
  if (!matched) return { locale: null, rest: pathname }
  const rest = `/${others.join('/')}`
  return { locale: matched, rest: rest === '/' ? '/' : rest.replace(/\/$/, '') }
}

/** Best match from an `Accept-Language` header, honouring q-weights. */
export function preferredFromHeader(header: string | null | undefined, active: string[]): string | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.split(';').map((piece) => piece.trim())
      const q = params.find((piece) => piece.startsWith('q='))
      return { tag, q: q ? Number(q.slice(2)) || 0 : 1 }
    })
    .filter((entry) => entry.tag && entry.tag !== '*')
    .sort((a, b) => b.q - a.q)

  for (const entry of ranked) {
    const matched = matchActive(entry.tag, active)
    if (matched) return matched
  }
  return null
}

export function detectLocale(args: {
  settings: MultilingualSettings
  pathname: string
  cookie?: string | null
  acceptLanguage?: string | null
}): LocaleDecision {
  const { settings, pathname } = args

  // Off means off: one language, no prefix handling, no cookie reading. This
  // keeps a single-language site's URLs exactly as they were before the
  // feature existed.
  if (!settings.enabled || settings.activeLocales.length < 2) {
    return {
      locale: settings.defaultLocale || DEFAULT_LOCALE,
      fromPath: false,
      pathname,
      source: 'default',
    }
  }

  const active = settings.activeLocales
  const fromPath = splitLocalePath(pathname, active)

  if (fromPath.locale) {
    return { locale: fromPath.locale, fromPath: true, pathname: fromPath.rest, source: 'path' }
  }

  const fromCookie = matchActive(args.cookie, active)
  if (fromCookie) return { locale: fromCookie, fromPath: false, pathname, source: 'cookie' }

  const fromHeader = preferredFromHeader(args.acceptLanguage, active)
  if (fromHeader) return { locale: fromHeader, fromPath: false, pathname, source: 'header' }

  return { locale: settings.defaultLocale, fromPath: false, pathname, source: 'default' }
}

/**
 * The URL for a given path in a given language.
 *
 * The default language is served unprefixed. Prefixing it too would be tidier
 * to reason about and would break every existing link and search result on a
 * site that switches multilingual on later, which is the common case.
 */
export function localisedHref(path: string, locale: string, settings: MultilingualSettings): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (!settings.enabled || locale === settings.defaultLocale) return clean
  if (!settings.activeLocales.includes(locale)) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}

/** `dir` for the document element. */
export const directionFor = (locale: string): 'ltr' | 'rtl' => (findLocale(locale)?.rtl ? 'rtl' : 'ltr')
