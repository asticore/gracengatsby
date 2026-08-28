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
}

export type ResolvedSeo = {
  /** Fully templated, ready for the <title> tag. */
  title: string
  /** The raw document name, before the template was applied. */
  rawTitle: string
  description?: string
  canonical: string
  path: string
  noIndex: boolean
  image?: { url: string; width?: number; height?: number }
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

  const imageSource: (number | string | Media) | null | undefined =
    input.seo?.ogImage || defaults?.defaultOgImage
  const imageUrl = absoluteUrl(mediaUrl(imageSource), baseUrl)
  const dimensions = mediaDimensions(imageSource)

  const noIndex =
    indexing?.allowIndexing === false ||
    Boolean(input.seo?.noIndex) ||
    pathMatches(path, parsePathList(indexing?.noindexPaths))

  const handle = defaults?.twitterHandle?.trim()

  return {
    title,
    rawTitle,
    description: description || undefined,
    canonical: path === '/' ? `${baseUrl}/` : `${baseUrl}${path}`,
    path,
    noIndex,
    image: imageUrl ? { url: imageUrl, ...dimensions } : undefined,
    twitterHandle: handle ? (handle.startsWith('@') ? handle : `@${handle}`) : undefined,
    siteName,
    kind: input.kind || 'website',
    publishedAt: input.publishedAt || undefined,
    updatedAt: input.updatedAt || undefined,
  }
}
