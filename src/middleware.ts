import type { NextRequest } from 'next/server'

import { domainMiddleware } from '@/features/domains/middleware'
import { multilingualMiddleware } from '@/features/multilingual/middleware'
import { securityMiddleware } from '@/features/security'
import { NOINDEX_HEADER_VALUE, isNoindexPath } from '@/features/security/noindex'

/**
 * Host routing (features/domains) wraps locale routing (features/multilingual), which wraps the
 * security pipeline in features/security. Each lives in its feature; this file only composes them.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export async function middleware(request: NextRequest) {
  // Host routing wraps locale routing and the security pipeline; the noindex header is applied to whatever comes back.
  const response = await domainMiddleware(request, (routed) => multilingualMiddleware(routed, securityMiddleware))
  // The locale strip rewrites the path, so the stripped path (x-pathname) is checked as well as the request path.
  const pathname = response.headers.get('x-pathname') ?? request.nextUrl.pathname
  if (isNoindexPath(pathname) || isNoindexPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', NOINDEX_HEADER_VALUE)
  }
  return response
}
