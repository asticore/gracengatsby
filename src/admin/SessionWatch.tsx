'use client'

/**
 * Session expiry monitor component.
 * Watches for 401 responses from API calls and redirects to login when session expires.
 * Also periodically checks /api/users/me to detect logout from other tabs.
 */

import { useEffect, useRef } from 'react'
import { shouldRedirectOn401, buildLoginRedirect } from './sessionWatchLogic'

const POLL_INTERVAL = 60000 // 60 seconds

/**
 * Client component that monitors session expiry.
 * - Wraps window.fetch to intercept 401 responses and redirect to login
 * - Periodically checks /api/users/me to detect session expiration
 * - Cleans up on unmount
 */
export function SessionWatch(): null {
  const fetchWrappedRef = useRef(false)
  const redirectedRef = useRef(false)
  const originalFetchRef = useRef<typeof fetch | null>(null)

  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    // Wrap fetch to intercept 401 responses
    if (!fetchWrappedRef.current && typeof window !== 'undefined') {
      fetchWrappedRef.current = true
      originalFetchRef.current = window.fetch

      window.fetch = async (...args: Parameters<typeof fetch>) => {
        if (!originalFetchRef.current) return new Response()
        const response = await originalFetchRef.current.apply(window, args)

        // Check if this 401 should trigger a redirect
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.toString() ?? ''
        if (shouldRedirectOn401(url, response.status, origin) && !redirectedRef.current) {
          redirectedRef.current = true
          const redirectUrl = buildLoginRedirect(window.location.pathname, window.location.search)
          window.location.assign(redirectUrl)
        }

        return response
      }
    }

    // Periodically check /api/users/me for session expiry
    const checkSession = async () => {
      try {
        const response = await fetch('/api/users/me', {
          credentials: 'include',
          cache: 'no-store',
        })

        if (response.status === 401 && !redirectedRef.current) {
          redirectedRef.current = true
          window.location.assign(buildLoginRedirect(window.location.pathname, window.location.search))
          return
        }
        if (!response.ok) return

        const data = (await response.json()) as unknown
        const user = data && typeof data === 'object' && 'user' in data ? (data as { user: unknown }).user : null

        // If no user or user is null, session has expired
        if (!user && !redirectedRef.current) {
          redirectedRef.current = true
          const redirectUrl = buildLoginRedirect(window.location.pathname, window.location.search)
          window.location.assign(redirectUrl)
        }
      } catch {
        // Silently ignore errors during polling
      }
    }

    // Initial check
    void checkSession()

    // Set up periodic checks
    const pollInterval = setInterval(() => {
      void checkSession()
    }, POLL_INTERVAL)

    // Also check on visibility change (tab comes to foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup
    return () => {
      clearInterval(pollInterval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      // Restore original fetch
      if (fetchWrappedRef.current && originalFetchRef.current) {
        window.fetch = originalFetchRef.current
        fetchWrappedRef.current = false
      }
    }
  }, [])

  return null
}
