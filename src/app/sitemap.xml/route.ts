import { buildSitemapEntries, renderSitemapXml } from '@/features/seo'

export const dynamic = 'force-dynamic'

/**
 * A route handler rather than Next's `sitemap.ts` convention so that turning
 * the sitemap off - or turning the whole SEO feature off - can answer 404.
 * The convention has no way to say "this file does not exist", and an empty
 * sitemap is a different statement from an absent one.
 */
export async function GET(): Promise<Response> {
  const entries = await buildSitemapEntries()

  if (entries === null) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(renderSitemapXml(entries), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
