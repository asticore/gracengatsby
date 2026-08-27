import type { NextRequest } from 'next/server'

import { securityMiddleware } from '@/features/security'

/**
 * Everything here lives in features/security: the security headers, probe-path
 * blocking, rate limiting, and the `x-pathname` header the layout reads to
 * work out which page it is rendering.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export function middleware(request: NextRequest) {
  return securityMiddleware(request)
}
