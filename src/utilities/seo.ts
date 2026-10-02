import type { Metadata } from 'next'

import { resolveSeo } from '@/features/seo/resolve'
import { getSeoContext } from '@/features/seo/settings'
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
 * Merges a document's own SEO fields with the site-wide defaults (Site Settings > SEO
 * and, when the SEO feature is on, the SEO & Analytics settings). Used by every public
 * route's generateMetadata().
 *
 * The page-level metadata replaces the layout-level one wholesale, so everything the
 * layout would have added (canonical, og:url, site name, X handle, image size, article
 * type) has to be produced here as well.
 */
export const buildMetadata = async (opts: {
  title: string
  seo?: SeoLike
  path?: string
  featuredImage?: (number | string | Media) | null
  kind?: 'website' | 'article'
  publishedAt?: string | null
  updatedAt?: string | null
}): Promise<Metadata> => {
  const engine = await getEngine()
  const settings = (await engine.findGlobal({ slug: 'site-settings', depth: 1 }).catch((): null => null)) as SiteSetting | null
  const context = await getSeoContext()
  const resolved = context.enabled
    ? resolveSeo(context, {
        title: opts.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seo: opts.seo as any,
        path: opts.path,
        featuredImage: opts.featuredImage,
        kind: opts.kind,
        publishedAt: opts.publishedAt,
        updatedAt: opts.updatedAt,
      })
    : null

  // The document's own meta title wins over its name, then the site template is applied.
  const pageTitle = opts.seo?.metaTitle?.trim() || opts.title
  const featureTemplate = context.settings?.defaults?.titleTemplate?.trim()
  const template = settings?.seo?.titleTemplate || '%s'
  const title =
    resolved && featureTemplate
      ? resolved.title
      : template.includes('%s')
        ? template.replace('%s', pageTitle)
        : pageTitle
  const description = opts.seo?.metaDescription || resolved?.description || settings?.seo?.defaultDescription || undefined

  // Share title and description fall back to the page's normal ones.
  const socialTitle = opts.seo?.socialTitle || title
  const socialDescription = opts.seo?.socialDescription || description

  // Image fallback chain: social image > featured image > site default.
  const ogImageUrl = resolveSocialImage(opts.seo?.ogImage, opts.featuredImage, settings?.seo?.defaultOgImage) || resolved?.image?.url
  const xImageUrl = resolveTwitterImage(opts.seo?.xImage, ogImageUrl) || resolved?.twitterImage?.url
  const imageSize = resolved?.image && resolved.image.url === ogImageUrl ? { width: resolved.image.width, height: resolved.image.height } : {}
  const xCard = opts.seo?.xCard || resolved?.twitterCard || 'summary_large_image'

  const siteIndexable = settings?.seo?.siteIndexable !== false
  const noIndex = Boolean(opts.seo?.noIndex) || !siteIndexable || Boolean(resolved?.noIndex)
  const noFollow = Boolean(opts.seo?.noFollow) || noIndex

  // An explicit canonical always wins; otherwise the path-based one when the route told us its path.
  const baseUrl = (resolved ? context.baseUrl : process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/+$/, '')
  const canonical = opts.seo?.canonicalUrl
    ? resolveCanonical(baseUrl, opts.path, opts.seo.canonicalUrl)
    : resolved && opts.path
      ? resolved.canonical
      : undefined

  const metadata: Metadata = {
    title,
    description,
    robots: resolved
      ? { index: !noIndex, follow: !noFollow, googleBot: { index: !noIndex, follow: !noFollow } }
      : { index: !noIndex, follow: !noFollow },
    openGraph: {
      ...(resolved ? { type: resolved.kind, siteName: resolved.siteName || undefined } : {}),
      ...(resolved && canonical ? { url: canonical } : {}),
      title: socialTitle || title,
      description: socialDescription || description,
      images: ogImageUrl ? [{ url: ogImageUrl, ...imageSize }] : undefined,
      ...(resolved?.kind === 'article' ? { publishedTime: resolved.publishedAt, modifiedTime: resolved.updatedAt } : {}),
    },
    twitter: {
      card: xCard as 'summary' | 'summary_large_image',
      title: socialTitle || title,
      description: socialDescription || description,
      images: xImageUrl ? [xImageUrl] : undefined,
      ...(resolved?.twitterHandle ? { site: resolved.twitterHandle, creator: resolved.twitterHandle } : {}),
    },
    alternates: canonical ? { canonical } : undefined,
  }
  if (resolved) metadata.metadataBase = new URL(context.baseUrl)
  return metadata
}
