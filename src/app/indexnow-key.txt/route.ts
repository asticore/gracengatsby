import { renderIndexNowKey } from '@/features/seo/indexNow'

// Settings are read from the database on every request, so this can never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

/**
 * The IndexNow key file. Served only while IndexNow is on and a key exists.
 * The key is sent to IndexNow as keyLocation, so the file name is fixed.
 */
export async function GET(): Promise<Response> {
  const body = await renderIndexNowKey()
  if (body === null) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}