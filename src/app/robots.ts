import type { MetadataRoute } from 'next'

import { getPayloadClient } from '@/lib/payload'

export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/$/, '')

export default async function robots(): Promise<MetadataRoute.Robots> {
  const payload = await getPayloadClient()
  const settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)
  const indexable = settings?.seo?.siteIndexable !== false

  return {
    rules: indexable
      ? [{ userAgent: '*', allow: '/', disallow: ['/admin', '/checkout', '/cart'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
