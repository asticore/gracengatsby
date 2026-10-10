import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { audit, auditContext } from './auditLog'
import { FINGERPRINT_HEADERS, securityHeaders } from './headers'
import { SESSION_COOKIE, isSessionExpired } from './loginProtection'
import { isDirectoryListingRequest, isProbePath } from './probePaths'
import { classifyRoute, clientKey, hit, limitFor } from './rateLimit'
import { readSecuritySettingsFromD1, type SecuritySettings } from './settings'
import { resolveRedirect, recordRedirectHit } from '@/features/redirects'
import { readServerRules, type ServerRules } from '@/features/seo/serverRules'
import { isBlockedPath } from '@/features/seo/siteFiles'

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

/**
 * Build redirect URL, preserving query string for path targets.
 * For path targets (starting with '/'), append the request's query string
 * to the target if it doesn't already have one.
 */
function buildRedirectUrl(requestUrl: URL, to: string): string {
  // If target is absolute URL or has query string, use as-is
  if (!to.startsWith('/') || to.includes('?')) {
    return to
  }

  // For path targets without query, preserve request query string
  const search = requestUrl.search
  return search ? `${to}${search}` : to
}

/**
 * Attempt to resolve and apply a redirect for the request.
 * Runs regardless of security feature enabled status.
 */
async function tryRedirect(request: NextRequest, settings: SecuritySettings): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  const method = request.method

  // Only resolve GET and HEAD requests
  if (method !== 'GET' && method !== 'HEAD') {
    return null
  }

  // Skip paths that should never be redirected
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/preview')
  ) {
    return null
  }

  // Skip paths with file extensions in the last segment
  const lastSegment = pathname.split('/').pop() || ''
  if (lastSegment.includes('.')) {
    return null
  }

  try {
    const resolved = await resolveRedirect(pathname)

    if (!resolved) {
      return null
    }

    // Schedule the hit recording (fire and forget)
    try {
      const { getCloudflareContext } = await import('@opennextjs/cloudflare')
      const context = await getCloudflareContext({ async: true })
      const ctx = context?.ctx

      // Called as a method: Workers' waitUntil throws "Illegal invocation" when detached from ctx.
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(recordRedirectHit(resolved.id))
      } else {
        void recordRedirectHit(resolved.id)
      }
    } catch {
      // Swallow errors in async recording
    }

    // Build the target URL with query string preservation
    const targetUrl = buildRedirectUrl(request.nextUrl, resolved.to)
    const redirectUrl = new URL(targetUrl, request.url)

    const response = NextResponse.redirect(redirectUrl, resolved.status)
    return applySecurityHeaders(response, settings, pathname)
  } catch {
    // Any error in redirect resolution falls through to passThrough
    return null
  }
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

/** The admin portal and the JSON API never get the Site files response headers or blocked-path rules. */
const isAppPath = (pathname: string): boolean =>
  ['/admin', '/api', '/_next'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * Applies the Site files "extra response headers" to a public response. These
 * come from the SEO & Analytics settings and are set after the security headers,
 * so an explicit rule can override one of them on purpose.
 */
export function applyServerResponseHeaders(response: NextResponse, rules: ServerRules, pathname: string): NextResponse {
  if (isAppPath(pathname)) return response
  for (const [name, value] of rules.headers) {
    // A value the runtime refuses is skipped on its own. It must never turn a
    // public page into an error.
    try {
      response.headers.set(name, value)
    } catch {
      // Skipped: the rest of the rules still apply.
    }
  }
  return response
}

/**
 * The path the blocked-paths rule compares against. Percent-encoding is decoded
 * (a malformed sequence keeps the raw path rather than throwing), then empty and
 * `.` segments are dropped and `..` is resolved, so `//`, `/./`, `%2F` and a
 * trailing slash cannot step around a rule. Case is handled by isBlockedPath.
 */
export function normaliseRequestPath(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Malformed encoding: match on the raw path.
  }
  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}

export async function securityMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  const settings = await readSecuritySettingsFromD1()
  // Fails open to no rules, so a settings read problem cannot take the site down.
  const rules = await readServerRules()

  // Preserved from the original middleware: the frontend layout reads this to
  // know which page it is rendering.
  const passThrough = (): NextResponse => {
    const response = NextResponse.next()
    response.headers.append('x-pathname', pathname)
    return applyServerResponseHeaders(applySecurityHeaders(response, settings, pathname), rules, pathname)
  }

  // Blocked paths (Site files > Server blocked paths) answer 404 before any
  // other rule runs, on every public path, whatever the security toggle says.
  if (!isAppPath(pathname) && isBlockedPath(normaliseRequestPath(pathname), rules.blockedPaths)) {
    return applyServerResponseHeaders(applySecurityHeaders(blocked(), settings, pathname), rules, pathname)
  }

  if (!settings.featureEnabled) {
    // Try redirects even when security feature is disabled
    const redirected = await tryRedirect(request, settings)
    if (redirected) return applyServerResponseHeaders(redirected, rules, pathname)
    return passThrough()
  }

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

  // Try redirects after all security checks
  const redirected = await tryRedirect(request, settings)
  if (redirected) return applyServerResponseHeaders(redirected, rules, pathname)

  return passThrough()
}
