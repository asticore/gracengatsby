import type { MetadataRoute } from 'next'

import { getEngine } from '@/lib/engine'

export const dynamic = 'force-dynamic'

const SITE_URL = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/$/, '')

export default async function robots(): Promise<MetadataRoute.Robots> {
  const engine = await getEngine()
  const settings = await engine.findGlobal({ slug: 'site-settings', depth: 0 }).catch((): null => null)
  const indexable = settings?.seo?.siteIndexable !== false

  return {
    rules: indexable
      ? [{ userAgent: '*', allow: '/', disallow: ['/admin', '/checkout', '/cart'] }]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
