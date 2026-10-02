import type { Media } from '@/engage-types'

import {
  absoluteUrl,
  mediaDimensions,
  mediaUrl,
  normalisePath,
  parsePathList,
  pathMatches,
  type DocumentSeo,
  type SeoContext,
} from './settings'

export type SeoInput = {
  /** The document's own name - the value `%page%` is replaced with. */
  title?: string | null
  /** The document's `seo` group, if it has one. */
  seo?: DocumentSeo
  /** Site-relative path of the document, e.g. `/blog/hello`. Defaults to `/`. */
  path?: string | null
  /** Falls back to the site default when the document has no description. */
  description?: string | null
  /** Drives the Open Graph type. Posts and events read better as articles. */
  kind?: 'website' | 'article'
  publishedAt?: string | null
  updatedAt?: string | null
  /** The document's featured image for fallback in image chain. */
  featuredImage?: (number | string | Media) | null
}

export type ResolvedSeo = {
  /** Fully templated, ready for the <title> tag. */
  title: string
  /** The raw document name, before the template was applied. */
  rawTitle: string
  description?: string
  /** Open Graph / social title */
  socialTitle?: string
  /** Open Graph / social description */
  socialDescription?: string
  canonical: string
  path: string
  noIndex: boolean
  noFollow: boolean
  image?: { url: string; width?: number; height?: number }
  twitterCard: 'summary' | 'summary_large_image'
  twitterImage?: { url: string; width?: number; height?: number }
  twitterHandle?: string
  siteName: string
  kind: 'website' | 'article'
  publishedAt?: string
  updatedAt?: string
}

const DEFAULT_TEMPLATE = '%page% | %site%'

/**
 * Applies the title template.
 *
 * `%s` is accepted alongside `%page%` because the older site-wide default used
 * it and existing installs still have it saved. A template that names neither
 * placeholder is treated as a literal suffix-free title rather than silently
 * discarding the page name.
 */
export const applyTitleTemplate = (template: string | null | undefined, page: string, site: string): string => {
  const raw = (template || DEFAULT_TEMPLATE).trim()
  const pageName = page.trim()

  if (!pageName) return site
  if (!raw) return pageName

  const hasPlaceholder = raw.includes('%page%') || raw.includes('%s')
  if (!hasPlaceholder) return pageName

  // `%site%` must go first: it contains the literal `%s`, so substituting the
  // back-compat placeholder ahead of it would rewrite the middle of the token.
  const applied = raw
    .replaceAll('%site%', site)
    .replaceAll('%page%', pageName)
    .replaceAll('%s', pageName)

  // A blank site name leaves dangling separators behind ("Home | ").
  return applied.replace(/\s*[|\-–—·]\s*$/, '').replace(/^\s*[|\-–—·]\s*/, '').trim()
}

/**
 * Resolves the canonical URL. If seo.canonicalUrl is set, uses it (absolute or path).
 * Otherwise returns the default path-based canonical.
 */
const resolveCanonical = (baseUrl: string, path: string, customCanonical?: string | null): string => {
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
  // Default: path-based canonical
  return path === '/' ? `${baseUrl}/` : `${baseUrl}${path}`
}

/**
 * Resolves the social image with fallback chain: seo.ogImage > featuredImage > site default
 */
const resolveSocialImage = (
  seoOgImage: (number | string | Media) | null | undefined,
  featuredImage: (number | string | Media) | null | undefined,
  defaultOgImage: (number | string | Media) | null | undefined,
  baseUrl: string
): { url: string; width?: number; height?: number } | undefined => {
  const imageSource = seoOgImage || featuredImage || defaultOgImage
  // mediaUrl extracts URL from Media objects; strings are already URLs
  const urlOrUndefined = typeof imageSource === 'string' ? imageSource : mediaUrl(imageSource)
  const imageUrl = absoluteUrl(urlOrUndefined, baseUrl)
  if (!imageUrl) return undefined
  const dimensions = mediaDimensions(imageSource)
  return { url: imageUrl, ...dimensions }
}

/**
 * Resolves the Twitter/X image with fallback chain: seo.xImage > social image chain
 */
const resolveTwitterImage = (
  xImage: (number | string | Media) | null | undefined,
  socialImage: { url: string; width?: number; height?: number } | undefined,
  baseUrl: string
): { url: string; width?: number; height?: number } | undefined => {
  if (xImage) {
    // mediaUrl extracts URL from Media objects; strings are already URLs
    const urlOrUndefined = typeof xImage === 'string' ? xImage : mediaUrl(xImage)
    const imageUrl = absoluteUrl(urlOrUndefined, baseUrl)
    if (imageUrl) {
      const dimensions = mediaDimensions(xImage)
      return { url: imageUrl, ...dimensions }
    }
  }
  return socialImage
}

/**
 * The single merge point: a document's own SEO fields beat the site-wide
 * defaults, and the defaults beat nothing at all. Every meta tag, card and
 * JSON-LD block downstream reads from this one result so they cannot disagree
 * with each other.
 */
export const resolveSeo = (context: SeoContext, input: SeoInput = {}): ResolvedSeo => {
  const { settings, siteName, baseUrl } = context
  const defaults = settings?.defaults
  const indexing = settings?.indexing

  const path = normalisePath(input.path)
  const rawTitle = (input.seo?.metaTitle || input.title || siteName || '').trim()
  const title = applyTitleTemplate(defaults?.titleTemplate, rawTitle, siteName)

  const description =
    input.seo?.metaDescription || input.description || defaults?.metaDescription || undefined

  // Open Graph / Social title and description
  // Only an explicit social title overrides; otherwise callers keep using the normal templated title.
  const socialTitle = input.seo?.socialTitle || undefined
  const socialDescription = input.seo?.socialDescription || description

  // Image fallback chain: seo.ogImage > featuredImage > site default
  const socialImage = resolveSocialImage(input.seo?.ogImage, input.featuredImage, defaults?.defaultOgImage, baseUrl)

  // Twitter/X image fallback chain: seo.xImage > socialImage chain
  const twitterImage = resolveTwitterImage(input.seo?.xImage, socialImage, baseUrl)

  // X card type: explicit choice, otherwise the large card when there is any image (as before)
  const xCard = input.seo?.xCard || (twitterImage || socialImage ? 'summary_large_image' : 'summary')

  const noIndex =
    indexing?.allowIndexing === false ||
    Boolean(input.seo?.noIndex) ||
    pathMatches(path, parsePathList(indexing?.noindexPaths))

  // noFollow is true when seo.noFollow is set OR when noIndex is true (preserve existing behaviour)
  const noFollow = Boolean(input.seo?.noFollow) || noIndex

  const handle = defaults?.twitterHandle?.trim()

  return {
    title,
    rawTitle,
    description: description || undefined,
    socialTitle: socialTitle || undefined,
    socialDescription: socialDescription || undefined,
    canonical: resolveCanonical(baseUrl, path, input.seo?.canonicalUrl),
    path,
    noIndex,
    noFollow,
    image: socialImage,
    twitterCard: xCard,
    twitterImage,
    twitterHandle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : undefined,
    siteName,
    kind: input.kind || 'website',
    publishedAt: input.publishedAt || undefined,
    updatedAt: input.updatedAt || undefined,
  }
}
