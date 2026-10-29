import { localisedHref } from '@/features/multilingual/detect'
import type { MultilingualSettings } from '@/features/multilingual/settings'
import type { Alternate } from '@/features/seo/localeSeo'

import { primaryOf, type SiteDomain } from './model'

/**
 * hreflang alternates across registered domains: the same page on each active domain, in that domain's
 * language, with x-default on the primary domain. Pure, so the metadata builder and the sitemap share it.
 *
 * Nothing is added with fewer than two active domains: a single-domain site keeps its markup unchanged.
 */
export function domainAlternates(
  path: string,
  domains: readonly SiteDomain[],
  settings: MultilingualSettings,
  localizedPaths?: Readonly<Record<string, string>> | null,
): Alternate[] {
  const active = domains.filter((domain) => domain.status === 'active')
  if (active.length < 2) return []

  const normalised = path.startsWith('/') ? path : `/${path}`
  const entries: Alternate[] = active.map((domain) => {
    const locale = domain.defaultLocale ?? settings.defaultLocale
    // On this domain the domain's own language is the unprefixed one, so its URL is built with it as the default.
    // A translated slug in that language replaces the source path (localizedSlugs.ts).
    const local = localisedHref(localizedPaths?.[locale] ?? normalised, locale, { ...settings, defaultLocale: locale })
    return { hreflang: locale, href: `https://${domain.host}${local}` }
  })

  const primary = primaryOf(active)
  if (primary) {
    const fallback = entries.find((entry) => entry.href.startsWith(`https://${primary.host}`))
    if (fallback) entries.push({ hreflang: 'x-default', href: fallback.href })
  }
  return entries
}

/**
 * Joins the same-site alternates with the cross-domain ones. Language entries keep both lists (current site
 * first when keys collide, handled by the caller's map); x-default comes from the cross-domain list when it has
 * one, since the primary domain is the default for the whole set.
 */
export function mergeAlternates(local: readonly Alternate[] | null | undefined, cross: readonly Alternate[]): Alternate[] {
  if (cross.length === 0) return [...(local ?? [])]
  const languages = [...cross, ...(local ?? [])].filter((alt) => alt.hreflang !== 'x-default')
  const seen = new Set<string>()
  const unique = languages.filter((alt) => (seen.has(alt.href) ? false : (seen.add(alt.href), true)))
  const xDefault = cross.find((alt) => alt.hreflang === 'x-default') ?? (local ?? []).find((alt) => alt.hreflang === 'x-default')
  return xDefault ? [...unique, xDefault] : unique
}
