import { NextRequest, NextResponse } from 'next/server'

import { multilingualMiddleware } from '@/features/multilingual/middleware'
import { securityMiddleware, readSecuritySettingsFromD1 } from '@/features/security'
import { NOINDEX_HEADER_VALUE, isNoindexPath } from '@/features/security/noindex'
import {
  ADMIN_PATH_ENV,
  DEFAULT_ADMIN_PATH,
  isUnderAdminRoot,
  resolveAdminRoot,
} from '@/features/security/adminPath'

/**
 * Locale routing (features/multilingual) wraps the security pipeline in
 * features/security. Both live in their features; this file only composes them.
 *
 * The admin URL is configurable. When it is not /admin, requests under the
 * configured path are served by the admin at /admin (the rewrite runs the whole
 * pipeline on the /admin path), and /admin itself answers 404. Redirects that
 * point at /admin are sent to the configured path instead.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export async function middleware(request: NextRequest) {
  const settings = await readSecuritySettingsFromD1()
  const root = resolveAdminRoot(settings.adminPath, process.env[ADMIN_PATH_ENV])
  const { pathname } = request.nextUrl

  let response: NextResponse
  if (root !== DEFAULT_ADMIN_PATH && isUnderAdminRoot(pathname, root)) {
    response = await serveCustomAdmin(request, root)
  } else if (root !== DEFAULT_ADMIN_PATH && isUnderAdminRoot(pathname, DEFAULT_ADMIN_PATH)) {
    response = new NextResponse('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  } else {
    response = await multilingualMiddleware(request, securityMiddleware)
  }

  // The locale strip rewrites the path, so the stripped path (x-pathname) is checked as well as the request path.
  const stripped = response.headers.get('x-pathname') ?? pathname
  if (isNoindexPath(pathname, root) || isNoindexPath(stripped, root)) {
    response.headers.set('X-Robots-Tag', NOINDEX_HEADER_VALUE)
  }
  return response
}

/** Runs the pipeline on the /admin path that a configured admin URL stands for, then rewrites to it. */
async function serveCustomAdmin(request: NextRequest, root: string): Promise<NextResponse> {
  const rest = request.nextUrl.pathname.slice(root.length)
  const url = new URL(request.url)
  url.pathname = `${DEFAULT_ADMIN_PATH}${rest}`
  const readable = request.method === 'GET' || request.method === 'HEAD'
  const target = readable
    ? new NextRequest(url, { headers: request.headers, method: request.method })
    : new NextRequest(url, { headers: request.headers, method: request.method, body: request.body, duplex: 'half' } as RequestInit)

  const inner = await multilingualMiddleware(target, securityMiddleware)
  if (inner.headers.get('x-middleware-next') !== '1') return relocate(inner, request, root)

  const out = NextResponse.rewrite(url, { request: { headers: target.headers } })
  inner.headers.forEach((value, key) => {
    if (!key.startsWith('x-middleware-') && key !== 'set-cookie') out.headers.set(key, value)
  })
  for (const cookie of inner.headers.getSetCookie()) out.headers.append('set-cookie', cookie)
  return out
}

/** A redirect that points into /admin is sent to the configured admin URL instead. */
function relocate(response: NextResponse, request: NextRequest, root: string): NextResponse {
  const location = response.headers.get('location')
  if (!location) return response
  let target: URL
  try {
    target = new URL(location, request.nextUrl.origin)
  } catch {
    return response
  }
  if (target.origin !== request.nextUrl.origin || !isUnderAdminRoot(target.pathname, DEFAULT_ADMIN_PATH)) return response
  target.pathname = `${root}${target.pathname.slice(DEFAULT_ADMIN_PATH.length)}`
  response.headers.set('location', /^https?:\/\//.test(location) ? target.toString() : `${target.pathname}${target.search}`)
  return response
}
