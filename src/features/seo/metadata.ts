import type { Metadata } from 'next'

import { resolveSeo, type SeoInput } from './resolve'
import { getSeoContext } from './settings'
import { getSiteIcons } from './siteFilesData'
import { getPublicIds } from '@/features/integrations/publicIds'

/**
 * Icon links from Site settings' favicon and logo. Kept outside the SEO toggle
 * on purpose: the browser tab icon is not a search feature.
 */
const iconMetadata = async (): Promise<Metadata['icons'] | undefined> => {
  const icons = await getSiteIcons()
  const icon = icons.favicon ?? icons.logo
  if (!icon) return undefined
  return {
    icon: [{ url: icon }],
    apple: [{ url: icons.logo ?? icon }],
  }
}

/**
 * Builds the whole <head> block for a route: title, description, canonical,
 * robots, Open Graph, Twitter card and the search-console verification codes.
 *
 * Returns an empty object when the SEO feature is off, so a route can call it
 * unconditionally and Next simply falls back to whatever the layout declares.
 */
export const generateSeoMetadata = async (input: SeoInput = {}): Promise<Metadata> => {
  const icons = await iconMetadata()
  const context = await getSeoContext()
  if (!context.enabled) return icons ? { icons } : {}

  const seo = resolveSeo(context, input)
  const verification = context.settings?.verification
  // Google's code now lives in Site settings > Integrations (falls back to the old field).
  const googleVerification = (await getPublicIds()).searchConsoleVerification

  const images = seo.image
    ? [{ url: seo.image.url, width: seo.image.width, height: seo.image.height }]
    : undefined

  const metadata: Metadata = {
    metadataBase: new URL(context.baseUrl),
    manifest: '/manifest.webmanifest',
    ...(icons ? { icons } : {}),
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    robots: {
      index: !seo.noIndex,
      follow: !seo.noFollow,
      googleBot: { index: !seo.noIndex, follow: !seo.noFollow },
    },
    openGraph: {
      type: seo.kind,
      url: seo.canonical,
      title: seo.socialTitle ? seo.socialTitle : seo.title,
      description: seo.socialDescription || seo.description,
      siteName: seo.siteName || undefined,
      images,
      ...(seo.kind === 'article'
        ? { publishedTime: seo.publishedAt, modifiedTime: seo.updatedAt }
        : {}),
    },
    twitter: {
      card: seo.twitterCard,
      title: seo.socialTitle ? seo.socialTitle : seo.title,
      description: seo.socialDescription || seo.description,
      images: (seo.twitterImage ? [seo.twitterImage] : images)?.map((image) => image.url),
      site: seo.twitterHandle,
      creator: seo.twitterHandle,
    },
  }

  // Bing and Pinterest have no first-class slot, so they go through `other`
  // under the exact meta names each service looks for.
  const other: Record<string, string> = {}
  if (verification?.bing) other['msvalidate.01'] = verification.bing
  if (verification?.pinterest) other['p:domain_verify'] = verification.pinterest

  if (googleVerification || Object.keys(other).length > 0) {
    metadata.verification = {
      ...(googleVerification ? { google: googleVerification } : {}),
      ...(Object.keys(other).length > 0 ? { other } : {}),
    }
  }

  return metadata
}
