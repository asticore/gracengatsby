import { NextRequest, NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { AUTH_URL, ADMIN_PAGE_PATH, GOOGLE_SCOPES, OAUTH_STATE_COOKIE, redirectUriFor } from '@/features/google/constants'
import { readGoogleClient } from '@/features/google/auth'
import { publicOrigin } from '@/features/google/origin'
import { createOauthState, STATE_MAX_AGE_MS } from '@/features/google/state'

export const dynamic = 'force-dynamic'

const back = async (origin: string, flag: string): Promise<Response> =>
  NextResponse.redirect(`${origin}${adminHref(ADMIN_PAGE_PATH, await getAdminRoot())}?google=${flag}`, 303)

/**
 * GET /api/google/connect: an admin starts the Google sign-in. Sets a short-lived
 * cookie with the state's nonce and sends the browser to Google's consent page.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = publicOrigin(request.url)
  try {
    const context = await getAdminContext()
    if (!context.user || !context.isAdmin) return back(origin, 'forbidden')

    const secret = process.env.ENGAGE_SECRET || ''
    if (!secret) return back(origin, 'no-secret')

    const engine = await getEngine()
    const { clientId } = await readGoogleClient(engine)
    if (!clientId) return back(origin, 'no-client')

    const { state, nonce } = createOauthState(secret)
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUriFor(origin),
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    })

    const response = NextResponse.redirect(`${AUTH_URL}?${params.toString()}`, 303)
    response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: origin.startsWith('https://'),
      sameSite: 'lax',
      path: '/api/google',
      maxAge: Math.floor(STATE_MAX_AGE_MS / 1000),
    })
    return response
  } catch (error) {
    console.error('google connect error:', error instanceof Error ? error.name : 'unknown')
    return back(origin, 'error')
  }
}
