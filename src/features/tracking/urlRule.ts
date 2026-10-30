/*
 * URL rules for tracking events, pure and shared by the admin tag editor, the validator and the public runtime.
 *
 * A rule is the page path an event fires on. Language prefixes ("/fr/shop") are ignored by default, so an event
 * tagged on "/shop" also fires on "/fr/shop" and every other language, and a tag made from the French page is the
 * same tag as the English one. Query strings and hashes never count, and trailing slashes do not change a page.
 */

/** Language codes that can prefix a path on the site. Two-letter codes plus the script and region forms in use. */
export const LOCALE_PREFIX_CODES: ReadonlySet<string> = new Set([
  'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ja', 'zh', 'zh-hans', 'zh-hant', 'ko', 'ar', 'hi', 'ru',
  'sv', 'da', 'no', 'nb', 'fi', 'pl', 'tr', 'el', 'he', 'cs', 'hu', 'ro', 'uk', 'id', 'th', 'vi', 'ms',
])

/**
 * Removes a leading language segment, and only that one. "/fr/shop" becomes "/shop", "/fr" becomes "/", and a
 * path whose first segment is not a known code ("/faq") is returned unchanged.
 */
export function stripLocalePrefix(path: string): string {
  const withSlash = path.startsWith('/') ? path : `/${path}`
  const [first, ...rest] = withSlash.split('/').slice(1)
  if (first && LOCALE_PREFIX_CODES.has(first.toLowerCase())) {
    return rest.length ? `/${rest.join('/')}` : '/'
  }
  return withSlash
}

/** The path part of a URL or path: no origin, query string or hash. */
export function pathOnly(url: string): string {
  const withoutHash = url.split('#')[0] ?? ''
  const withoutQuery = withoutHash.split('?')[0] ?? ''
  try {
    if (/^https?:\/\//i.test(withoutQuery)) return new URL(withoutQuery).pathname
  } catch {
    // Not a parseable URL: fall through and treat it as a path.
  }
  return withoutQuery || '/'
}

/** The canonical rule for a page path: no language prefix, no query, no trailing slash. Always starts with "/". */
export function normaliseRulePath(path: string): string {
  const stripped = stripLocalePrefix(pathOnly(path.trim()))
  const trimmed = stripped.replace(/\/+$/, '')
  return trimmed || '/'
}

/** Whether a page path (as the browser shows it) matches a rule path, ignoring the language prefix. */
export function rulePathMatches(rulePath: string, pagePath: string): boolean {
  return normaliseRulePath(pagePath) === normaliseRulePath(rulePath)
}
