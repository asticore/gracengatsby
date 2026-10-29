import type { NextRequest } from 'next/server'

import { domainMiddleware } from '@/features/domains/middleware'
import { multilingualMiddleware } from '@/features/multilingual/middleware'
import { securityMiddleware } from '@/features/security'

/**
 * Host routing (features/domains) wraps locale routing (features/multilingual), which wraps the
 * security pipeline in features/security. Each lives in its feature; this file only composes them.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export function middleware(request: NextRequest) {
  return domainMiddleware(request, (routed) => multilingualMiddleware(routed, securityMiddleware))
}
