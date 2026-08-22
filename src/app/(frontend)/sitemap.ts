import type { MetadataRoute } from 'next'

import { getPayloadClient } from '@/lib/payload'
import { getAllResolvedPages } from '@/utilities/pagePaths'
import { getFeatureFlags } from '@/utilities/features'

export const dynamic = 'force-dynamic'

// Set SITE_URL as a Cloudflare Worker env var to your real domain - used here
// and in robots.ts to build absolute URLs.
const SITE_URL = (process.env.SITE_URL || 'https://gracengatsby.com').replace(/\/$/, '')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayloadClient()
  const flags = await getFeatureFlags()
  const entries: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: 'weekly', priority: 1 }]

  const pages = await getAllResolvedPages()
  pages.forEach(({ page, path }) => {
    if (page.seo?.noIndex) return
    if (page.isHomepage) return // already included as SITE_URL above
    entries.push({
      url: `${SITE_URL}/${path.join('/')}`,
      lastModified: page.updatedAt,
      changeFrequency: 'monthly',
    })
  })

  if (flags.ecommerce) {
    entries.push({ url: `${SITE_URL}/shop`, changeFrequency: 'daily' })
    const { docs: products } = await payload.find({
      collection: 'products',
      where: { _status: { equals: 'published' } },
      limit: 0,
      depth: 0,
    })
    products.forEach((product) => {
      entries.push({ url: `${SITE_URL}/shop/${product.slug}`, lastModified: product.updatedAt, changeFrequency: 'weekly' })
    })
  }

  if (flags.events) {
    entries.push({ url: `${SITE_URL}/events`, changeFrequency: 'daily' })
    const { docs: events } = await payload.find({
      collection: 'events',
      where: { _status: { equals: 'published' } },
      limit: 0,
      depth: 0,
    })
    events.forEach((event) => {
      entries.push({ url: `${SITE_URL}/events/${event.slug}`, lastModified: event.updatedAt, changeFrequency: 'weekly' })
    })
  }

  if (flags.blog) {
    entries.push({ url: `${SITE_URL}/blog`, changeFrequency: 'weekly' })
    const { docs: posts } = await payload.find({
      collection: 'posts',
      where: { _status: { equals: 'published' } },
      limit: 0,
      depth: 0,
    })
    posts.forEach((post) => {
      if (post.seo?.noIndex) return
      entries.push({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updatedAt, changeFrequency: 'monthly' })
    })
  }

  if (flags.faq) {
    entries.push({ url: `${SITE_URL}/faq`, changeFrequency: 'monthly' })
  }

  return entries
}
