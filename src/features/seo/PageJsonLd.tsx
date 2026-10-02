import React from 'react'

import { buildPageJsonLd } from './pageSchema'
import { getSeoContext, mediaUrl, absoluteUrl, type DocumentSeo } from './settings'
import type { Media } from '@/engage-types'

/**
 * Per-page structured data component for search engines.
 *
 * Renders nothing when the SEO feature is disabled or the page has noIndex set.
 * Otherwise emits a <script type="application/ld+json"> block with page-specific
 * schema.org data (BlogPosting for articles, Event for events, etc).
 *
 * Like SeoJsonLd, the output escapes </ to prevent early script tag closure.
 */
export const PageJsonLd = async ({
  collection,
  doc,
  path,
}: {
  collection: string
  doc?: {
    title?: string
    schemaType?: string | null
    seo?: DocumentSeo
    featuredImage?: unknown
    author?: { email?: string; name?: string } | string | number | null
    publishedDate?: string
    datePublished?: string
    updatedAt?: string
    startDate?: string
    endDate?: string
    location?: { venueName?: string; address?: string } | null
  } | null
  path: string
}): Promise<React.ReactElement | null> => {
  const context = await getSeoContext()

  // Feature disabled or page has noIndex set
  if (!context.enabled || doc?.seo?.noIndex) {
    return null
  }

  if (!doc) return null

  const title = doc.seo?.metaTitle || doc.title || ''
  if (!title) return null

  // Build absolute URL for the page
  const url = context.baseUrl + (path.startsWith('/') ? path : `/${path}`)

  // Derive image: prefer social image, fall back to featured image, convert to absolute URL
  let imageUrl: string | undefined
  const ogImage = doc.seo?.ogImage
  const featuredImage = doc.featuredImage

  // mediaUrl expects (number | string | Media) | null | undefined
  if (ogImage) {
    imageUrl = absoluteUrl(mediaUrl(ogImage as number | string | Media), context.baseUrl)
  } else if (featuredImage) {
    imageUrl = absoluteUrl(mediaUrl(featuredImage as number | string | Media), context.baseUrl)
  }

  // Derive author name if author is populated
  let authorName: string | undefined
  if (doc.author && typeof doc.author === 'object' && doc.author !== null) {
    const author = doc.author as Record<string, unknown>
    authorName = (author.email as string) || (author.name as string)
  }

  // Dates - check multiple field names depending on collection
  const docRecord = doc as Record<string, unknown>
  const datePublished = doc.publishedDate || doc.datePublished || (docRecord.startDate as string | undefined)
  const dateModified = doc.updatedAt || (docRecord.endDate as string | undefined)

  // Build the JSON-LD object
  const jsonLd = buildPageJsonLd({
    collection,
    schemaType: doc.schemaType,
    title,
    description: doc.seo?.metaDescription,
    url,
    baseUrl: context.baseUrl,
    siteName: context.siteName,
    imageUrl,
    datePublished,
    dateModified,
    authorName,
  })

  if (!jsonLd) return null

  // Escape </ to prevent early script tag closure
  const jsonString = JSON.stringify(jsonLd).replaceAll('</', '<\\/')

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  )
}
