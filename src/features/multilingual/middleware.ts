import { NextRequest, NextResponse } from 'next/server'

import { LOCALE_COOKIE } from './detect'
import { isPortalPath } from './portal'
import { LOCALE_COOKIE_MAX_AGE, LOCALE_HEADER, isLocaleRoutable, routeLocale } from './routing'
import { readMultilingualSettingsFromD1 } from './settings'

type Handler = (request: NextRequest) => Promise<NextResponse>

/**
 * Wraps the security pipeline with locale routing.
 *
 * Off (the default) the request goes straight through, untouched. On, a
 * non-default prefix is stripped and the inner pipeline runs on the stripped
 * path, so probes, rate limits and headers see the real page. Its pass-through
 * response is turned into a rewrite that carries the locale header; redirects
 * and blocked responses are returned as they are.
 */
export async function multilingualMiddleware(request: NextRequest, handle: Handler): Promise<NextResponse> {
  const settings = await readMultilingualSettingsFromD1()
  if (!isLocaleRoutable(settings)) return handle(request)

  const readable = request.method === 'GET' || request.method === 'HEAD'
  // Only reads are rebuilt; a rebuilt request would drop a POST body.
  if (!readable) return handle(request)

  // The logged-in portal (account, sign-in, enrolled lessons) never takes part in locale routing: no prefix
  // strip, no redirect, no cookie. Its language is resolved from the visitor in the layout. A locale header
  // sent by the client is removed, so nothing downstream can read a language from it.
  if (isPortalPath(request.nextUrl.pathname, settings.activeLocales)) {
    const headers = new Headers(request.headers)
    headers.delete(LOCALE_HEADER)
    const target = new NextRequest(request.url, { headers, method: request.method })
    const response = await handle(target)
    if (response.headers.get('x-middleware-next') !== '1') return response
    const out = NextResponse.next({ request: { headers: target.headers } })
    response.headers.forEach((value, key) => {
      if (!key.startsWith('x-middleware-') && key !== 'set-cookie') out.headers.set(key, value)
    })
    for (const cookie of response.headers.getSetCookie()) out.headers.append('set-cookie', cookie)
    return out
  }

  const route = routeLocale(request.nextUrl.pathname, settings)

  if (route.kind === 'default') {
    const url = new URL(request.url)
    url.pathname = route.location
    return NextResponse.redirect(url, 308)
  }

  // Nothing to strip and nothing spoofed: the request is exactly as it arrived.
  if (route.kind === 'none' && !request.headers.has(LOCALE_HEADER)) return handle(request)

  const headers = new Headers(request.headers)
  headers.delete(LOCALE_HEADER)
  let target = request
  if (route.kind === 'strip') {
    const url = new URL(request.url)
    url.pathname = route.rest
    headers.set(LOCALE_HEADER, route.locale)
    headers.set('x-pathname', route.rest)
    target = new NextRequest(url, { headers, method: request.method })
  } else {
    target = new NextRequest(request.url, { headers, method: request.method })
  }

  const response = await handle(target)
  // Redirects and blocked responses are final; only a pass-through becomes a rewrite.
  if (response.headers.get('x-middleware-next') !== '1') return response

  const out =
    route.kind === 'strip'
      ? NextResponse.rewrite(target.nextUrl, { request: { headers: target.headers } })
      : NextResponse.next({ request: { headers: target.headers } })

  response.headers.forEach((value, key) => {
    if (!key.startsWith('x-middleware-') && key !== 'set-cookie') out.headers.set(key, value)
  })
  for (const cookie of response.headers.getSetCookie()) out.headers.append('set-cookie', cookie)

  if (route.kind === 'strip') {
    out.cookies.set(LOCALE_COOKIE, route.locale, {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    })
  }
  return out
}
