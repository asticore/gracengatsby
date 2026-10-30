import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { canManageTrackingConnections, type ConnectionViewer } from '@/features/tracking/connect/access'
import { providerFrom, screenUrl, NO_STORE } from '@/features/tracking/connect/routeSupport'
import { startConnect } from '@/features/tracking/connect/service'
import { publicOrigin } from '@/features/google/origin'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/**
 * GET /api/tracking-connect/[provider]/start: an admin starts the Meta or TikTok
 * sign-in. Sets the signed, HttpOnly state cookie and sends the browser to the
 * provider's consent page. Nothing is stored until the callback succeeds.
 */
export async function GET(request: NextRequest, { params }: Ctx): Promise<Response> {
  const origin = publicOrigin(request.url)
  const provider = providerFrom((await params).provider)
  if (!provider) return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404, headers: NO_STORE })
  try {
    const context = await getAdminContext()
    const viewer: ConnectionViewer = { user: context.user, isAdmin: context.isAdmin, can: context.can as ConnectionViewer['can'] }
    if (!canManageTrackingConnections(viewer)) return NextResponse.redirect(await screenUrl(origin, `${provider}-forbidden`), 303)

    const engine = await getEngine()
    const result = await startConnect({ engine, fetchImpl: fetch, secret: process.env.ENGAGE_SECRET || '', now: () => Date.now() }, provider, origin)
    if ('reason' in result) return NextResponse.redirect(await screenUrl(origin, `${provider}-${result.reason}`), 303)

    const response = NextResponse.redirect(result.location, 303)
    response.cookies.set(result.cookie.name, result.cookie.value, {
      httpOnly: true,
      secure: origin.startsWith('https://'),
      sameSite: 'lax',
      path: `/api/tracking-connect/${provider}`,
      maxAge: result.cookie.maxAge,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    console.error('tracking connect start error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.redirect(await screenUrl(origin, `${provider}-error`), 303)
  }
}
