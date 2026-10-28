import type { MultilingualSettings } from './settings'

/**
 * Locale-prefixed internal links, decided without I/O. Pure: no node or db
 * imports, so the tests, the renderers and any client code share one rule set.
 *
 * `localizeHref('/about', 'fr', s)` gives `/fr/about`. Everything that is not
 * an internal page link is returned unchanged: external URLs, scheme links
 * (mailto, tel, javascript), anchors, protocol-relative URLs, relative paths,
 * the app's own paths (admin, api, account portal, preview, _next), files
 * with an extension, links already carrying a locale prefix, and every link
 * when the locale is the default one or multilingual is off.
 */

/** First path segments that always keep their URL, whatever the locale. */
const UNPREFIXED_ROOTS = ['admin', 'api', 'account', 'preview', '_next']

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

export function localizeHref(href: string, locale: string | null | undefined, settings: MultilingualSettings): string {
  if (!href || !locale || !settings.enabled || settings.activeLocales.length < 2) return href
  if (locale === settings.defaultLocale || !settings.activeLocales.includes(locale)) return href
  // Only root-relative paths are internal pages. Anchors, queries, scheme links (mailto:, tel:) and protocol-relative URLs stay put.
  if (!href.startsWith('/') || href.startsWith('//')) return href
  if (SCHEME.test(href)) return href

  const cut = href.search(/[?#]/)
  const pathname = cut === -1 ? href : href.slice(0, cut)
  const suffix = cut === -1 ? '' : href.slice(cut)

  const segments = pathname.split('/').filter(Boolean)
  const head = segments[0]?.toLowerCase() ?? ''
  // Already prefixed with any active locale: leave it, so redirects and Link components never double-prefix.
  if (settings.activeLocales.some((code) => code.toLowerCase() === head)) return href
  if (UNPREFIXED_ROOTS.includes(head)) return href
  const last = segments[segments.length - 1] ?? ''
  if (last.includes('.')) return href

  const path = pathname === '/' ? '' : pathname.replace(/\/+$/, '')
  return `/${locale}${path}${suffix}` || `/${locale}`
}
