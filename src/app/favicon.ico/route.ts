import { getSiteIcons, notFound } from '@/features/seo/siteFilesData'

// Settings are read from the database on every request, so this can never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

/**
 * Browsers request /favicon.ico whether or not a page links one, so it is
 * answered here. A configured favicon is redirected to its media URL; with
 * none set the answer is 404, which browsers handle quietly.
 */
export async function GET(): Promise<Response> {
  const { favicon } = await getSiteIcons()
  if (!favicon) return notFound()
  return new Response(null, {
    status: 302,
    headers: {
      location: favicon,
      'cache-control': 'public, max-age=300, s-maxage=3600',
    },
  })
}