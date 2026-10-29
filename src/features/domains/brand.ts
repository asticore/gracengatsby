import type { SiteDomain } from './model'

/**
 * Per-domain brand values for the public site. Pure: the layout, the site-title block and the SEO builder read
 * the same rules. A value a domain leaves blank keeps the site-wide value, so an override is only ever additive.
 */

type SocialLinks = { show?: boolean; links?: { platform?: string | null; url?: string | null }[] | null } | null | undefined

/** Site settings with this domain's name and logo applied. Returns the input unchanged when there is no domain. */
export function domainBrand<T extends { siteName?: string | null; logo?: unknown }>(settings: T | null, domain: SiteDomain | null): T | null {
  if (!domain || !settings) return settings
  const o = domain.overrides
  return {
    ...settings,
    siteName: o.siteName || settings.siteName,
    logo: o.logoUrl ? { url: o.logoUrl } : settings.logo,
  }
}

/**
 * The social links for the header or footer on this domain. When the domain sets any social link, its own list
 * replaces the site-wide one for that place; otherwise the site-wide value is returned unchanged.
 */
export function domainSocials(base: SocialLinks, domain: SiteDomain | null): SocialLinks {
  if (!domain) return base
  const entries: { platform: string; url: string }[] = []
  const o = domain.overrides.socials
  for (const [platform, url] of [
    ['instagram', o.instagram],
    ['facebook', o.facebook],
    ['linkedin', o.linkedin],
    ['x', o.x],
  ] as const) {
    if (url) entries.push({ platform, url })
  }
  if (entries.length === 0) return base
  return { show: true, links: entries }
}

/** Site-title tagline for this domain, or the site-wide one. */
export function domainTagline(siteTagline: string, domain: SiteDomain | null): string {
  return domain?.overrides.tagline || siteTagline
}
