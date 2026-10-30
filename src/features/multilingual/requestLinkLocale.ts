import { cache } from 'react'

import { localizeHref } from './localizeHref'
import type { MultilingualSettings } from './settings'

/**
 * The locale that internal links on this request are rendered for. Set once by
 * the root layout (before the page renders, in the same request) and read by
 * the block renderer, the navigation and the archive cards. Null means "do not
 * rewrite": the default locale, multilingual off, or the logged-in portal.
 */
type LinkState = {
  locale: string | null
  settings: MultilingualSettings | null
  /** Source path to its translated slug path in `locale` (localizedSlugs.ts). Null when there are none. */
  paths: ReadonlyMap<string, string> | null
}

const holder = cache((): LinkState => ({ locale: null, settings: null, paths: null }))

export function setRequestLinkLocale(
  locale: string | null,
  settings: MultilingualSettings | null,
  paths: ReadonlyMap<string, string> | null = null,
): void {
  const state = holder()
  state.locale = locale
  state.settings = settings
  state.paths = paths
}

/**
 * Localises one href for the current request. Identity outside a non-default locale.
 * An internal page with a translated slug links to that slug; any other internal
 * link gets the locale prefix.
 */
export function localizeForRequest(href: string): string {
  const { locale, settings, paths } = holder()
  if (!locale || !settings) return href
  if (paths && paths.size > 0 && href.startsWith('/') && !href.startsWith('//')) {
    const cut = href.search(/[?#]/)
    const pathname = cut === -1 ? href : href.slice(0, cut)
    const translated = paths.get(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)
    if (translated !== undefined) return localizeHref(`${translated}${cut === -1 ? '' : href.slice(cut)}`, locale, settings)
  }
  return localizeHref(href, locale, settings)
}

const LINK_KEY = /(url|href|link)$/i

/**
 * A shallow copy of a block whose link-valued fields (`primaryCtaUrl`,
 * `linkUrl`, `href`...) point at the current request's locale. Non-string and
 * non-link fields are passed through untouched, and the input is never mutated.
 */
export function localizeBlockLinks<T extends Record<string, unknown>>(block: T): T {
  const { locale } = holder()
  if (!locale) return block
  let out: Record<string, unknown> | null = null
  for (const [key, value] of Object.entries(block)) {
    if (typeof value !== 'string' || !LINK_KEY.test(key)) continue
    const next = localizeForRequest(value)
    if (next === value) continue
    out ??= { ...block }
    out[key] = next
  }
  return (out ?? block) as T
}
