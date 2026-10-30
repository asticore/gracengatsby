import { gate } from '@/features/apiBuilder/gate'
import { isGuideFormat, renderGuide, siteNameFor } from '@/features/apiBuilder/guideResponse'

export const dynamic = 'force-dynamic'

/**
 * GET ?format=openapi.json|openapi.yaml|guide.md|guide.html|postman.json. The developer guide for the
 * endpoints the builder has enabled, as a download. Signed-in admins, or holders of the `api` read
 * permission only. The base URL is this request's own origin; no key is ever written in.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await gate('read')
  if (session.ok === false) return Response.json({ error: session.error }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  const url = new URL(request.url)
  const format = url.searchParams.get('format')
  if (!isGuideFormat(format)) return Response.json({ error: 'Unknown format.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const endpoints = await session.store.list()
  return renderGuide(
    format,
    endpoints,
    { baseUrl: url.origin, siteName: await siteNameFor(session.engine), generatedAt: new Date().toISOString().slice(0, 10) },
    'download',
  )
}
