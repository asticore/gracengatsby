import type { Metadata } from 'next'

import { getEngine } from '@/lib/engine'
import type { Media, SiteSetting } from '@/engage-types'

type SeoLike = {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: (number | string | Media) | null
  noIndex?: boolean | null
  canonicalUrl?: string | null
  noFollow?: boolean | null
  socialTitle?: string | null
  socialDescription?: string | null
  xCard?: 'summary' | 'summary_large_image' | null
  xImage?: (number | string | Media) | null
} | null | undefined

const mediaUrl = (media: (number | string | Media) | null | undefined): string | undefined => {
  if (media && typeof media === 'object') return (media as Media).url || undefined
  return undefined
}

/**
 * Resolves the social image with fallback chain: ogImage > featuredImage > site default
 */
const resolveSocialImage = (
  ogImage: (number | string | Media) | null | undefined,
  featuredImage: (number | string | Media) | null | undefined,
  defaultOgImage: (number | string | Media) | null | undefined
): string | undefined => {
  const imageSource = ogImage || featuredImage || defaultOgImage
  // mediaUrl extracts URL from Media objects; strings are already URLs
  if (typeof imageSource === 'string') return imageSource
  return mediaUrl(imageSource)
}

/**
 * Resolves the Twitter/X image with fallback chain: xImage > social image chain
 */
const resolveTwitterImage = (
  xImage: (number | string | Media) | null | undefined,
  socialImageUrl: string | undefined
): string | undefined => {
  if (xImage) {
    // mediaUrl extracts URL from Media objects; strings are already URLs
    const url = typeof xImage === 'string' ? xImage : mediaUrl(xImage)
    if (url) return url
  }
  return socialImageUrl
}

/**
 * Resolves the canonical URL. If seo.canonicalUrl is set, uses it.
 * Otherwise returns the default path-based canonical.
 */
const resolveCanonical = (baseUrl: string, path: string | undefined, customCanonical?: string | null): string | undefined => {
  if (customCanonical) {
    // If it's already absolute (has a protocol), use as-is
    if (customCanonical.startsWith('http://') || customCanonical.startsWith('https://')) {
      return customCanonical
    }
    // If it starts with /, resolve against baseUrl
    if (customCanonical.startsWith('/')) {
      return `${baseUrl}${customCanonical}`
    }
    // Otherwise treat as a path relative to baseUrl
    return `${baseUrl}/${customCanonical}`
  }
  // Default path-based canonical
  if (!path || path === '/') return `${baseUrl}/`
  return `${baseUrl}${path}`
}

/**
 * Merges a document's own SEO fields with the site-wide defaults from
 * Site Settings > SEO. Used by every public route's generateMetadata().
 */
export const buildMetadata = async (opts: {
  title: string
  seo?: SeoLike
  path?: string
  featuredImage?: (number | string | Media) | null
}): Promise<Metadata> => {
  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 1 }).catch((): null => null)) as SiteSetting | null

  const template = settings?.seo?.titleTemplate || '%s'
  const title = template.includes('%s') ? template.replace('%s', opts.title) : opts.title
  const description = opts.seo?.metaDescription || settings?.seo?.defaultDescription || undefined

  // Open Graph / Social title and description
  // socialTitle falls back to the same (templated) title as before
  const socialTitle = opts.seo?.socialTitle || title
  const socialDescription = opts.seo?.socialDescription || description

  // Image fallback chain: ogImage > featuredImage > site default
  const ogImageUrl = resolveSocialImage(opts.seo?.ogImage, opts.featuredImage, settings?.seo?.defaultOgImage)

  // Twitter/X image fallback chain: xImage > social image chain
  const xImageUrl = resolveTwitterImage(opts.seo?.xImage, ogImageUrl)

  // X card type: explicit choice, otherwise the large image card as before
  const xCard = opts.seo?.xCard || 'summary_large_image'

  const siteIndexable = settings?.seo?.siteIndexable !== false
  const noIndex = Boolean(opts.seo?.noIndex) || !siteIndexable
  const noFollow = Boolean(opts.seo?.noFollow) || noIndex

  // Only an explicit canonical is emitted here; the layout-level SEO feature already provides the default one.
  const siteUrl = process.env.SITE_URL || 'https://gracengatsby.com'
  const baseUrl = siteUrl.replace(/\/+$/, '')
  const canonical = opts.seo?.canonicalUrl ? resolveCanonical(baseUrl, opts.path, opts.seo.canonicalUrl) : undefined

  return {
    title,
    description,
    robots: {
      index: !noIndex,
      follow: !noFollow,
    },
    openGraph: {
      title: socialTitle || title,
      description: socialDescription || description,
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined,
    },
    twitter: {
      card: xCard as 'summary' | 'summary_large_image',
      title: socialTitle || title,
      description: socialDescription || description,
      images: xImageUrl ? [xImageUrl] : undefined,
    },
    alternates: canonical ? { canonical } : undefined,
  }
}
