import { getAdminContext } from '@/admin/auth'
import { publicOrigin } from '@/features/google/origin'
import { PROVIDER_IDS, redirectUriFor } from '@/features/socialLogin/providers'

export const dynamic = 'force-dynamic'

/** GET /api/social/redirect-uris: the exact callback URL to register for each provider on THIS site. Admin only. */
export async function GET(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user || !context.isAdmin) return new Response('Forbidden', { status: 403 })
  const origin = publicOrigin(request.url)
  return Response.json(
    { origin, uris: Object.fromEntries(PROVIDER_IDS.map((id) => [id, redirectUriFor(origin, id)])) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
