import type { NextRequest } from 'next/server'

import { multilingualMiddleware } from '@/features/multilingual/middleware'
import { securityMiddleware } from '@/features/security'
import { NOINDEX_HEADER_VALUE, isNoindexPath } from '@/features/security/noindex'

/**
 * Locale routing (features/multilingual) wraps the security pipeline in
 * features/security. Both live in their features; this file only composes them.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export async function middleware(request: NextRequest) {
  const response = await multilingualMiddleware(request, securityMiddleware)
  // The locale strip rewrites the path, so the stripped path (x-pathname) is checked as well as the request path.
  const pathname = response.headers.get('x-pathname') ?? request.nextUrl.pathname
  if (isNoindexPath(pathname) || isNoindexPath(request.nextUrl.pathname)) {
    response.headers.set('X-Robots-Tag', NOINDEX_HEADER_VALUE)
  }
  return response
}
