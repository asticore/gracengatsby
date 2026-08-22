import type { Metadata } from 'next'

import { getPayloadClient } from '@/lib/payload'
import type { Media } from '@/payload-types'

type SeoLike = {
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: (number | string | Media) | null
  noIndex?: boolean | null
} | null | undefined

const mediaUrl = (media: (number | string | Media) | null | undefined): string | undefined => {
  if (media && typeof media === 'object') return (media as Media).url || undefined
  return undefined
}

/**
 * Merges a document's own SEO fields with the site-wide defaults from
 * Site Settings > SEO. Used by every public route's generateMetadata().
 */
export const buildMetadata = async (opts: { title: string; seo?: SeoLike; path?: string }): Promise<Metadata> => {
  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 1 }).catch((): null => null)

  const template = settings?.seo?.titleTemplate || '%s'
  const title = template.includes('%s') ? template.replace('%s', opts.title) : opts.title
  const description = opts.seo?.metaDescription || settings?.seo?.defaultDescription || undefined
  const ogImageUrl = mediaUrl(opts.seo?.ogImage) || mediaUrl(settings?.seo?.defaultOgImage)
  const siteIndexable = settings?.seo?.siteIndexable !== false
  const noIndex = Boolean(opts.seo?.noIndex) || !siteIndexable

  return {
    title,
    description,
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      images: ogImageUrl ? [{ url: ogImageUrl }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  }
}
