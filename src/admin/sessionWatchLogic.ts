/**
 * Pure functions for session expiry detection and redirect building.
 * Testable logic separated from browser APIs and React hooks.
 */

/**
 * Determines if a 401 response should trigger a redirect to login.
 * Returns true only for same-origin API calls (except login endpoints),
 * false for cross-origin, non-API, or 403 responses.
 */
export function shouldRedirectOn401(url: string, status: number, origin: string): boolean {
  if (status !== 401) return false

  try {
    const urlObj = new URL(url, origin)

    // Must be same origin
    if (urlObj.origin !== origin) return false

    const pathname = urlObj.pathname

    // Must be an API route
    if (!pathname.startsWith('/api/')) return false

    // Exclude login endpoints from redirect
    if (
      pathname === '/api/users/login' ||
      pathname === '/api/users/logout' ||
      pathname === '/api/users/me'
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
}

/**
 * Builds a login redirect URL with session expired notice and redirect target.
 * Returns a path-relative URL with encoded query parameters.
 */
export function buildLoginRedirect(pathname: string, search: string): string {
  const params = new URLSearchParams()
  params.set('expired', '1')

  // Build the redirect target: pathname + search
  const fullPath = pathname + search
  params.set('redirect', fullPath)

  return `/admin/login?${params.toString()}`
}
