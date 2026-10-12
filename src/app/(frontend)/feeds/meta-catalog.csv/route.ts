import { metaCatalogCsv } from '@/features/ecommerce/lib/feeds'
import { loadFeed } from '@/features/ecommerce/server/feeds'

export const dynamic = 'force-dynamic'

/** Facebook and Instagram catalogue feed. 404 until "Product feeds" is switched on in Shop settings. */
export async function GET(request: Request): Promise<Response> {
  const feed = await loadFeed(request)
  if (!feed) return new Response('Not found', { status: 404 })
  return new Response(metaCatalogCsv(feed.items), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400', 'x-content-type-options': 'nosniff' },
  })
}
