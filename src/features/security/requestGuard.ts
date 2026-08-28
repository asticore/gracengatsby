import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { audit, auditContext } from './auditLog'
import { FINGERPRINT_HEADERS, securityHeaders } from './headers'
import { SESSION_COOKIE, isSessionExpired } from './loginProtection'
import { isDirectoryListingRequest, isProbePath } from './probePaths'
import { classifyRoute, clientKey, hit, limitFor } from './rateLimit'
import { readSecuritySettingsFromD1, type SecuritySettings } from './settings'

/**
 * Everything the Security screen enforces on the request itself, in one place
 * the middleware can call.
 *
 * Order matters and is not arbitrary. Cheap rejections come first so that a
 * scan costs a string comparison rather than a database read; the settings
 * read is cached per isolate, and blocked requests never reach the app at all.
 *
 *   1. Probe paths and directory listings - answered from a constant list.
 *   2. Rate limit - in-memory, no I/O.
 *   3. Session cap - reads one cookie.
 *   4. Response headers - applied to whatever the app returns.
 *
 * A 404 is returned for blocked probes rather than a 403, deliberately: a 403
 * confirms the path means something here, which is the one piece of
 * information the scanner came for.
 */

const BLOCK_BODY = 'Not found'

function blocked(): NextResponse {
  return new NextResponse(BLOCK_BODY, {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

export function applySecurityHeaders(
  response: NextResponse,
  settings: SecuritySettings,
  pathname: string,
): NextResponse {
  for (const [name, value] of Object.entries(securityHeaders(settings, pathname))) {
    response.headers.set(name, value)
  }

  if (settings.featureEnabled && settings.hardening.hideCmsFingerprint) {
    for (const name of FINGERPRINT_HEADERS) response.headers.delete(name)
  }

  return response
}

export async function securityMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const settings = await readSecuritySettingsFromD1()

  // Preserved from the original middleware: the frontend layout reads this to
  // know which page it is rendering.
  const passThrough = (): NextResponse => {
    const response = NextResponse.next()
    response.headers.append('x-pathname', pathname)
    return applySecurityHeaders(response, settings, pathname)
  }

  if (!settings.featureEnabled) return passThrough()

  const hardening = settings.hardening

  if (hardening.blockProbePaths && isProbePath(pathname)) {
    void audit({ action: 'probe.blocked', detail: pathname, ...auditContext(request) }, settings)
    return applySecurityHeaders(blocked(), settings, pathname)
  }

  if (hardening.disableDirectoryListing && isDirectoryListingRequest(pathname)) {
    return applySecurityHeaders(blocked(), settings, pathname)
  }

  const route = classifyRoute(pathname, request.method)
  const limit = limitFor(settings, route)

  if (limit !== null) {
    const decision = hit(`${route}:${clientKey(request)}`, limit)

    if (decision.limited) {
      void audit(
        {
          action: 'rate-limit.blocked',
          detail: `${route} ${pathname} (${decision.count}/${decision.limit} per minute)`,
          ...auditContext(request),
        },
        settings,
      )

      const response = new NextResponse('Too many requests. Please wait a moment and try again.', {
        status: 429,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'retry-after': String(decision.retryAfterSeconds),
        },
      })
      return applySecurityHeaders(response, settings, pathname)
    }
  }

  // The session cap only applies to the portal. A stale token on a public page
  // is the engine's business, and forcing a redirect there would bounce
  // shoppers out of a checkout for no gain.
  const token = request.cookies.get(SESSION_COOKIE)?.value

  if (token && pathname.startsWith('/admin') && isSessionExpired(token, settings)) {
    void audit({ action: 'session.expired', detail: pathname, ...auditContext(request) }, settings)

    const onLoginScreen = pathname === '/admin/login' || pathname.startsWith('/admin/login/')
    const response = onLoginScreen
      ? NextResponse.next()
      : NextResponse.redirect(new URL('/admin/login', request.url))

    response.cookies.delete(SESSION_COOKIE)
    return applySecurityHeaders(response, settings, pathname)
  }

  return passThrough()
}
