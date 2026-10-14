import { jsonLdFor } from '@/fields/schemaType'

import { breadcrumbList, faqEntities, type Crumb, type FaqItem } from './schemaNodes'

type JsonLdNode = Record<string, unknown>

const ARTICLE_TYPES = ['BlogPosting', 'Article', 'NewsArticle']

/**
 * Builds per-page JSON-LD structured data.
 *
 * Each page type (determined by schemaType) gets its own @type and properties.
 * MenuPage and LocalBusinessPage are handled specially via jsonLdFor's extra field.
 * All undefined keys are omitted to keep output clean.
 *
 * Like SeoJsonLd, the output should be escaped with replaceAll('</', '<\\/')
 * before being embedded in a script tag.
 */
export const buildPageJsonLd = (input: {
  collection: string
  schemaType?: string | null
  title: string
  description?: string
  url: string
  baseUrl: string
  siteName: string
  imageUrl?: string
  datePublished?: string
  dateModified?: string
  /** Event start and end. The end date is never taken from dateModified. */
  startDate?: string
  endDate?: string
  /** Author display name only. An email is never published. */
  authorName?: string
  wordCount?: number
  articleSection?: string
  keywords?: string
  inLanguage?: string
  sku?: string
  brand?: string
  /** FAQ entries shown on the page, emitted as mainEntity questions. */
  faqs?: FaqItem[]
  /** Breadcrumb trail from Home to the page itself. */
  breadcrumbs?: Crumb[]
  extra?: Record<string, unknown>
}): JsonLdNode | null => {
  const {
    collection,
    schemaType,
    title,
    description,
    url,
    baseUrl,
    siteName,
    imageUrl,
    datePublished,
    dateModified,
    startDate,
    endDate,
    authorName,
    wordCount,
    articleSection,
    keywords,
    inLanguage,
    sku,
    brand,
    faqs,
    breadcrumbs,
    extra,
  } = input

  // Title is required
  if (!title) return null

  // Get the @type from schemaType, falling back to content-type defaults
  const typeInfo = jsonLdFor(collection, schemaType, { title, siteName, url: baseUrl })
  const type = typeInfo.type

  const result: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
  }

  if (description) result.description = description

  // Reference the website node created by SeoJsonLd
  result.isPartOf = { '@id': `${baseUrl}/#website` }
  if (inLanguage) result.inLanguage = inLanguage

  // Primary image - shown when page is shared
  if (imageUrl) {
    result.primaryImageOfPage = {
      '@type': 'ImageObject',
      url: imageUrl,
    }
  }

  // Publication and modification dates
  if (datePublished) result.datePublished = datePublished
  if (dateModified) result.dateModified = dateModified

  // Article-family types (BlogPosting, Article, NewsArticle) add headline, author and body facts
  if (ARTICLE_TYPES.includes(type)) {
    result.headline = title

    // Only a real name is published. Without one there is no author node at all.
    if (authorName) {
      result.author = {
        '@type': 'Person',
        name: authorName,
      }
    }

    // mainEntityOfPage points back to the webpage
    result.mainEntityOfPage = { '@id': url }

    if (wordCount) result.wordCount = wordCount
    if (articleSection) result.articleSection = articleSection
    if (keywords) result.keywords = keywords
  }

  // Product type adds image, sku and brand when the data exists
  if (type === 'Product') {
    if (imageUrl) {
      result.image = imageUrl
    }
    if (sku) result.sku = sku
    if (brand) result.brand = { '@type': 'Brand', name: brand }
  }

  // Event type adds its real start and end. The start falls back to the published date for callers that only pass that.
  if (type === 'Event') {
    const start = startDate || datePublished
    if (start) result.startDate = start
    if (endDate) result.endDate = endDate
  }

  // Course type adds provider
  if (type === 'Course') {
    result.provider = {
      '@type': 'Organization',
      name: siteName,
    }
  }

  // FAQ questions from the page's FAQ blocks
  if (faqs && faqs.length > 0) {
    const entities = faqEntities(faqs)
    if (entities.length > 0) result.mainEntity = entities
  }

  // Breadcrumb trail, embedded on the page node so the page stays one script
  const crumbs = breadcrumbList(breadcrumbs ?? [])
  if (crumbs) result.breadcrumb = crumbs

  // Spread the extra properties from typeInfo (MenuPage mainEntity, LocalBusinessPage about, etc)
  if (typeInfo.extra) {
    Object.entries(typeInfo.extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        result[key] = value
      }
    })
  }

  // Also spread any caller-provided extra
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        result[key] = value
      }
    })
  }

  // Remove any remaining undefined keys
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) {
      delete result[key]
    }
  })

  return result
}