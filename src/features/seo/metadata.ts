import type { Metadata } from 'next'

import { resolveSeo, type SeoInput } from './resolve'
import { getSeoContext } from './settings'

/**
 * Builds the whole <head> block for a route: title, description, canonical,
 * robots, Open Graph, Twitter card and the search-console verification codes.
 *
 * Returns an empty object when the SEO feature is off, so a route can call it
 * unconditionally and Next simply falls back to whatever the layout declares.
 */
export const generateSeoMetadata = async (input: SeoInput = {}): Promise<Metadata> => {
  const context = await getSeoContext()
  if (!context.enabled) return {}

  const seo = resolveSeo(context, input)
  const verification = context.settings?.verification

  const images = seo.image
    ? [{ url: seo.image.url, width: seo.image.width, height: seo.image.height }]
    : undefined

  const metadata: Metadata = {
    metadataBase: new URL(context.baseUrl),
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    robots: seo.noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },
    openGraph: {
      type: seo.kind,
      url: seo.canonical,
      title: seo.title,
      description: seo.description,
      siteName: seo.siteName || undefined,
      images,
      ...(seo.kind === 'article'
        ? { publishedTime: seo.publishedAt, modifiedTime: seo.updatedAt }
        : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: seo.title,
      description: seo.description,
      images: images?.map((image) => image.url),
      site: seo.twitterHandle,
      creator: seo.twitterHandle,
    },
  }

  // Bing and Pinterest have no first-class slot, so they go through `other`
  // under the exact meta names each service looks for.
  const other: Record<string, string> = {}
  if (verification?.bing) other['msvalidate.01'] = verification.bing
  if (verification?.pinterest) other['p:domain_verify'] = verification.pinterest

  if (verification?.google || Object.keys(other).length > 0) {
    metadata.verification = {
      ...(verification?.google ? { google: verification.google } : {}),
      ...(Object.keys(other).length > 0 ? { other } : {}),
    }
  }

  return metadata
}
