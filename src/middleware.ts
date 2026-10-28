import type { NextRequest } from 'next/server'

import { multilingualMiddleware } from '@/features/multilingual/middleware'
import { securityMiddleware } from '@/features/security'

/**
 * Locale routing (features/multilingual) wraps the security pipeline in
 * features/security. Both live in their features; this file only composes them.
 *
 * Kept as a one-liner on purpose. Middleware runs on every single request, so
 * it is the worst place for logic to accumulate quietly.
 */
export function middleware(request: NextRequest) {
  return multilingualMiddleware(request, securityMiddleware)
}
