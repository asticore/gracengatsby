import { getEngine } from '@/engine'

import { buildFeedItems, type FeedItem } from '../lib/feeds'

type Doc = Record<string, unknown>

/**
 * Loads the published products and turns them into feed rows, or null when feeds are switched off in Shop settings
 * (the routes then answer 404, like the sitemap does).
 */
export async function loadFeed(request: Request): Promise<{ items: FeedItem[]; title: string; link: string } | null> {
  const engine = (await getEngine()) as unknown as {
    find: (a: unknown) => Promise<{ docs: Doc[] }>
    findGlobal: (a: unknown) => Promise<Doc>
  }
  const shop = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { storefront?: Doc; tax?: Doc }
  const sf = shop.storefront ?? {}
  if (sf.feedsEnabled !== true) return null
  const payment = (await engine.findGlobal({ slug: 'payment-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { general?: { currency?: string } }
  const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { siteName?: string }
  const products = await engine.find({ collection: 'products', where: { _status: { equals: 'published' } }, limit: 1000, depth: 1, overrideAccess: true })
  const origin = new URL(request.url).origin
  const title = String(site.siteName || shop.tax?.businessName || 'Shop')
  const condition = ['new', 'used', 'refurbished'].includes(String(sf.feedCondition)) ? (sf.feedCondition as 'new' | 'used' | 'refurbished') : 'new'
  const items = buildFeedItems(products.docs, {
    baseUrl: origin,
    currency: String(payment.general?.currency || 'AUD'),
    brand: String(sf.feedBrand || shop.tax?.businessName || title),
    condition,
    googleCategory: typeof sf.feedGoogleCategory === 'string' ? sf.feedGoogleCategory : '',
  })
  return { items, title, link: origin }
}
