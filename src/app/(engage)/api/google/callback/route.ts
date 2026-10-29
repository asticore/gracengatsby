import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { ADMIN_PAGE_PATH, OAUTH_STATE_COOKIE, TOKEN_URL, redirectUriFor } from '@/features/google/constants'
import { readGoogleClient } from '@/features/google/auth'
import { publicOrigin } from '@/features/google/origin'
import { requestJson } from '@/features/google/http'
import { verifyOauthState } from '@/features/google/state'
import { emailFromIdToken } from '@/features/google/idToken'
import { saveSignIn } from '@/features/google/connectionSave'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Sends the admin back to the screen with a short flag, and clears the state cookie. */
async function back(origin: string, flag: string): Promise<Response> {
  const response = NextResponse.redirect(`${origin}${adminHref(ADMIN_PAGE_PATH, await getAdminRoot())}?google=${flag}`, 303)
  response.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/google', maxAge: 0, httpOnly: true, sameSite: 'lax' })
  response.headers.set('Cache-Control', NO_STORE['Cache-Control'])
  return response
}

/**
 * GET /api/google/callback: Google sends the browser here after consent. The
 * state must match this browser's cookie, the code is exchanged for a refresh
 * token, and the refresh token is stored encrypted. Only an admin can finish it.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = publicOrigin(request.url)
  try {
    const params = request.nextUrl.searchParams
    if (params.get('error')) return back(origin, 'denied')

    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return back(origin, 'forbidden')

    const secret = process.env.ENGAGE_SECRET || ''
    const cookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value ?? null
    if (!verifyOauthState(params.get('state'), cookie, secret)) return back(origin, 'state')

    const code = params.get('code') ?? ''
    if (!code || code.length > 2000) return back(origin, 'error')

    const engine = await getEngine()
    const { clientId, clientSecret } = await readGoogleClient(engine)
    if (!clientId || !clientSecret) return back(origin, 'no-client')

    const exchange = await requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUriFor(origin),
        grant_type: 'authorization_code',
      }).toString(),
    })
    const body = (exchange.body ?? {}) as { refresh_token?: unknown; id_token?: unknown; scope?: unknown; error?: unknown }
    if (!exchange.ok) return back(origin, 'exchange')
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) return back(origin, 'no-refresh')

    await saveSignIn(engine, {
      refreshToken: body.refresh_token,
      email: emailFromIdToken(body.id_token),
      scopes: typeof body.scope === 'string' ? body.scope.slice(0, 1000) : '',
    })
    return back(origin, 'connected')
  } catch (error) {
    console.error('google callback error:', error instanceof Error ? error.name : 'unknown')
    return back(origin, 'error')
  }
}
