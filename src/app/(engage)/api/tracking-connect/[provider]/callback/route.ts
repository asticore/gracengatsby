import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { canManageTrackingConnections, type ConnectionViewer } from '@/features/tracking/connect/access'
import { providerFrom, screenUrl, NO_STORE } from '@/features/tracking/connect/routeSupport'
import { finishConnect } from '@/features/tracking/connect/service'
import { stateCookieName } from '@/features/tracking/connect/constants'
import { clientFor } from '@/features/tracking/connect/providers'
import { publicOrigin } from '@/features/google/origin'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ provider: string }> }

/**
 * GET /api/tracking-connect/[provider]/callback: the provider sends the browser
 * back here. The signed state must match this browser's cookie; the code is
 * exchanged on the server and the token is stored encrypted. The browser only
 * ever receives a short notice, never the token.
 */
export async function GET(request: NextRequest, { params }: Ctx): Promise<Response> {
  const origin = publicOrigin(request.url)
  const provider = providerFrom((await params).provider)
  if (!provider) return NextResponse.json({ ok: false, reason: 'not-found' }, { status: 404, headers: NO_STORE })
  const clear = (response: NextResponse): Response => {
    response.cookies.set(stateCookieName(provider), '', { path: `/api/tracking-connect/${provider}`, maxAge: 0, httpOnly: true, sameSite: 'lax' })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
  try {
    const params = request.nextUrl.searchParams
    if (params.get('error')) return clear(NextResponse.redirect(await screenUrl(origin, `${provider}-denied`), 303))

    const context = await getAdminContext()
    const viewer: ConnectionViewer = { user: context.user, isAdmin: context.isAdmin, can: context.can as ConnectionViewer['can'] }
    if (!canManageTrackingConnections(viewer)) return clear(NextResponse.redirect(await screenUrl(origin, `${provider}-forbidden`), 303))

    // Meta returns `code`, TikTok returns `auth_code`. Each client says which one it expects.
    const code = params.get(clientFor(provider).codeParam) ?? ''
    const engine = await getEngine()
    const cookie = request.cookies.get(stateCookieName(provider))?.value ?? null
    const result = await finishConnect(
      { engine, fetchImpl: fetch, secret: process.env.ENGAGE_SECRET || '', now: () => Date.now() },
      provider,
      origin,
      { code, stateParam: params.get('state'), cookie },
    )
    const notice = 'reason' in result ? `${provider}-${result.reason}` : `${provider}-connected`
    return clear(NextResponse.redirect(await screenUrl(origin, notice), 303))
  } catch (error) {
    console.error('tracking connect callback error:', error instanceof Error ? error.name : 'unknown')
    return clear(NextResponse.redirect(await screenUrl(origin, `${provider}-error`), 303))
  }
}
