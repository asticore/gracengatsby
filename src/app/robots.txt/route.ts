import { buildRobotsTxt } from '@/features/seo'

// Settings are read from the database on every request, so this can never be
// prerendered at build time.
export const dynamic = 'force-dynamic'

/**
 * A route handler rather than Next's `robots.ts` convention: the settings let
 * an editor supply a complete replacement file, and the structured form that
 * convention returns cannot represent arbitrary directives.
 */
export async function GET(): Promise<Response> {
  const body = await buildRobotsTxt()

  if (body === null) {
    return new Response('Not found', { status: 404 })
  }

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
