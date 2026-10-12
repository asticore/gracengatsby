import { googleMerchantXml } from '@/features/ecommerce/lib/feeds'
import { loadFeed } from '@/features/ecommerce/server/feeds'

export const dynamic = 'force-dynamic'

/** Google Merchant Center product feed. 404 until "Product feeds" is switched on in Shop settings. */
export async function GET(request: Request): Promise<Response> {
  const feed = await loadFeed(request)
  if (!feed) return new Response('Not found', { status: 404 })
  return new Response(googleMerchantXml(feed.items, { title: feed.title, link: feed.link, description: `${feed.title} products` }), {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
