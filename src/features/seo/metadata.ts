import type { Metadata } from 'next'

import { resolveSeo, type SeoInput } from './resolve'
import { getSeoContext } from './settings'
import { getSiteIcons } from './siteFilesData'
import { currentPageLocale } from './pageLocale'
import { localeSeoFields, languagesMap } from './localeSeo'
import { availableLocalesForPath } from '@/features/multilingual/applyTranslations'
import { localizedPathsFor, sourcePathFor } from '@/features/multilingual/slugIndex'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'
import { domainAlternates, mergeAlternates } from '@/features/domains/alternates'
import { readDomainsFromD1 } from '@/features/domains/store'
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
  // Language of this request (null while multilingual is off or single-language).
  const pageLocale = await currentPageLocale()
  // Source path of the page: a translated URL in the request is still the same document (localizedSlugs.ts).
  const localePath = input.path ?? (pageLocale?.pathname !== undefined ? await sourcePathFor(pageLocale.locale, pageLocale.pathname) : undefined)
  const localizedPaths = localePath !== undefined ? await localizedPathsFor(localePath) : undefined
  const localeSeo = pageLocale && localePath !== undefined
    ? localeSeoFields({
        baseUrl: context.baseUrl,
        path: localePath,
        locale: pageLocale.locale,
        settings: pageLocale.settings,
        explicitCanonical: Boolean(input.seo?.canonicalUrl),
        available: await availableLocalesForPath(localePath),
        localizedPaths,
      })
    : null
  const canonical = localeSeo?.canonical ?? seo.canonical
  // hreflang across registered domains: the same page on each active domain (empty with fewer than two).
  const crossDomain = localePath !== undefined
    ? domainAlternates(localePath, await readDomainsFromD1(), pageLocale?.settings ?? (await readMultilingualSettingsFromD1()), localizedPaths)
    : []
  const alternates = mergeAlternates(localeSeo?.alternates, crossDomain)
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
    alternates: localeSeo || alternates.length > 0
      ? { canonical, languages: languagesMap(alternates) }
      : { canonical: seo.canonical },
    robots: {
      index: !seo.noIndex,
      follow: !seo.noFollow,
      googleBot: { index: !seo.noIndex, follow: !seo.noFollow },
    },
    openGraph: {
      type: seo.kind,
      url: canonical,
      title: seo.socialTitle ? seo.socialTitle : seo.title,
      description: seo.socialDescription || seo.description,
      siteName: seo.siteName || undefined,
      images,
      ...(localeSeo ? { locale: localeSeo.ogLocale, alternateLocale: localeSeo.ogAlternateLocales } : {}),
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
