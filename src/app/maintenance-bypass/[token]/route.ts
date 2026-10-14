import { NextResponse } from 'next/server'

import { getSitePages } from '@/features/site/pages'
import { BYPASS_COOKIE, BYPASS_COOKIE_MAX_AGE, isValidBypassToken } from '@/features/site/maintenance'

export const dynamic = 'force-dynamic'

/**
 * GET /maintenance-bypass/<token>: when the token matches the one stored in Site pages, sets the bypass
 * cookie for seven days and sends the visitor to the home page. Any other token gets a plain 404.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params
  const stored = (await getSitePages()).maintenance.bypassToken

  if (!isValidBypassToken(token) || !stored || token !== stored) {
    return new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  const url = new URL(request.url)
  const response = NextResponse.redirect(new URL('/', url))
  response.cookies.set(BYPASS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: BYPASS_COOKIE_MAX_AGE,
  })
  return response
}
