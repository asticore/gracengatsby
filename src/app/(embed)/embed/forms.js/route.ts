import { loaderScript } from '@/features/forms/embedScript'

export const dynamic = 'force-dynamic'

/** GET /embed/forms.js - the loader the "script" embed snippet uses. Public, cacheable, no data in it. */
export async function GET(request: Request): Promise<Response> {
  const origin = new URL(request.url).origin
  return new Response(loaderScript(origin), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
