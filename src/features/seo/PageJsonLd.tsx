import React from 'react'

import { buildPageJsonLd } from './pageSchema'
import { getSeoContext, mediaUrl, absoluteUrl, type DocumentSeo } from './settings'
import { articleFacts, authorNameOf, eventExtraFor, loadFaqItems } from './pageSchemaData'
import { currentPageLocale } from './pageLocale'
import { breadcrumbTrail, type TrailItem } from './schemaNodes'
import { localisedHref } from '@/features/multilingual/detect'
import type { Media } from '@/engage-types'

/**
 * Per-page structured data component for search engines.
 *
 * Renders nothing when the SEO feature is disabled or the page has noIndex set.
 * Otherwise emits a <script type="application/ld+json"> block with page-specific
 * schema.org data (BlogPosting for articles, Event for events, etc), including
 * FAQ questions from FAQ blocks and a breadcrumb trail.
 *
 * `trail` is the page's ancestors (pages only), root first. Other collections
 * get their trail from their section (Blog, Shop, Events).
 *
 * Like SeoJsonLd, the output escapes </ to prevent early script tag closure.
 */
export const PageJsonLd = async ({
  collection,
  doc,
  path,
  extra,
  trail,
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
    sku?: string | null
    location?: { venueName?: string | null; address?: string | null; isOnline?: boolean | null } | null
    eventType?: string | null
    ticketTiers?: unknown
    ticketProduct?: unknown
    categories?: Array<{ name?: string }> | null
    content?: unknown
    layout?: unknown
    blocks?: unknown
  } | null
  path: string
  /** Extra schema.org properties merged into the node (a product's offers and aggregateRating). */
  extra?: Record<string, unknown>
  /** Ancestor pages for the breadcrumb trail, root first (pages collection only). */
  trail?: TrailItem[]
}): Promise<React.ReactElement | null> => {
  const context = await getSeoContext()

  // Feature disabled or page has noIndex set
  if (!context.enabled || doc?.seo?.noIndex) {
    return null
  }

  if (!doc) return null

  const title = doc.seo?.metaTitle || doc.title || ''
  if (!title) return null

  // Locale: a non-default language gets its own URL (/fr/about) in the schema, so the node
  // describes the page the reader is on. Off, or the default language, the path is unchanged.
  const page = await currentPageLocale()
  const sitePath = path.startsWith('/') ? path : `/${path}`
  const localePath = page ? localisedHref(sitePath, page.locale, page.settings) : sitePath
  // The prefix alone (e.g. '/fr'), recovered from the localised path.
  const localePrefix = localePath === sitePath ? '' : sitePath === '/' ? localePath : localePath.slice(0, localePath.length - sitePath.length)
  const url = context.baseUrl + localePath

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

  const organizerName = context.settings?.schema?.organisationName?.trim() || context.siteName
  const record = doc as Record<string, unknown>
  const article = articleFacts(record, page?.locale)
  const faqs = await loadFaqItems(record)
  const eventFields = collection === 'events' ? eventExtraFor(record, url, organizerName) : {}

  // Build the JSON-LD object. Dates are kept apart: an end date is never a modified date.
  const jsonLd = buildPageJsonLd({
    collection,
    schemaType: doc.schemaType,
    title,
    description: doc.seo?.metaDescription,
    url,
    baseUrl: context.baseUrl,
    siteName: context.siteName,
    imageUrl,
    datePublished: doc.publishedDate || doc.datePublished,
    dateModified: doc.updatedAt,
    startDate: doc.startDate,
    endDate: doc.endDate,
    authorName: authorNameOf(doc.author),
    wordCount: article.wordCount,
    articleSection: article.articleSection,
    keywords: article.keywords,
    inLanguage: article.inLanguage,
    sku: doc.sku || undefined,
    faqs,
    breadcrumbs: breadcrumbTrail({
      collection,
      baseUrl: context.baseUrl,
      path,
      title: doc.title || title,
      pageTrail: trail,
      localePrefix,
    }),
    extra: { ...eventFields, ...extra },
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
