import { jsonLdFor } from '@/fields/schemaType'

type JsonLdNode = Record<string, unknown>

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
  authorName?: string
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
    authorName,
    extra,
  } = input

  // Title is required
  if (!title) return null

  // Get the @type from schemaType, falling back to content-type defaults
  const typeInfo = jsonLdFor(collection, schemaType, { title, siteName, url: baseUrl })

  const result: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': typeInfo.type,
    '@id': `${url}#webpage`,
    url,
    name: title,
  }

  if (description) result.description = description

  // Reference the website node created by SeoJsonLd
  result.isPartOf = { '@id': `${baseUrl}/#website` }

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

  // Article-family types (BlogPosting, Article, NewsArticle) add headline and author
  if (['BlogPosting', 'Article', 'NewsArticle'].includes(typeInfo.type)) {
    result.headline = title

    if (authorName) {
      result.author = {
        '@type': 'Person',
        name: authorName,
      }
    } else {
      result.author = {
        '@type': 'Organization',
        name: siteName,
      }
    }

    // mainEntityOfPage points back to the webpage
    result.mainEntityOfPage = { '@id': url }
  }

  // Product type adds name, description, and potentially offers
  if (typeInfo.type === 'Product') {
    // name and description already set above
    if (imageUrl) {
      result.image = imageUrl
    }
    // offers would go here if we had a real price + currency, but that data
    // may not be available yet from the collection fields
  }

  // Event type adds dates and location
  if (typeInfo.type === 'Event') {
    if (datePublished) result.startDate = datePublished
    if (dateModified) result.endDate = dateModified

    // location is handled via extra if present
  }

  // Course type adds provider
  if (typeInfo.type === 'Course') {
    result.provider = {
      '@type': 'Organization',
      name: siteName,
    }
  }

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
