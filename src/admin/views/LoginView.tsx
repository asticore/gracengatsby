'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Admin login form - simple email/password auth with POST to /api/users/login.
 * On success, stores auth token via Set-Cookie header (credentials: 'include')
 * and redirects to the protected admin dashboard. On failure, shows error message
 * from the server or a generic fallback. Disables inputs during submission.
 *
 * Accepts search params:
 * - expired=1: Shows "Your session expired. Please log in again." notice
 * - redirect=<path>: Redirects to this path after successful login (must be relative, start with /admin)
 */
export function LoginView({ redirectTo = '/admin' }: { redirectTo?: string } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Check if session expired and get redirect target
  const isSessionExpired = searchParams.get('expired') === '1'
  const finalRedirectTo = useMemo(() => {
    const redirectParam = searchParams.get('redirect')
    // Only use redirect if it's a relative path starting with /admin
    if (redirectParam && typeof redirectParam === 'string' && redirectParam.startsWith('/admin') && !redirectParam.startsWith('//')) {
      return redirectParam
    }
    return redirectTo
  }, [searchParams, redirectTo])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const body = (await response.json()) as { errors?: Array<{ message?: string }> }

      if (response.ok) {
        router.push(finalRedirectTo)
        router.refresh()
        return
      }

      const errorMessage = body.errors?.[0]?.message ?? 'Login failed. Check your email and password.'
      setError(errorMessage)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <h1 className="admin-login__title">Admin Login</h1>

        <form onSubmit={handleSubmit}>
          {isSessionExpired && (
            <div className="admin-login__notice">Your session expired. Please log in again.</div>
          )}
          {error && <div className="admin-login__error">{error}</div>}

          <div className="admin-login__field">
            <label htmlFor="field-email">Email</label>
            <input
              id="field-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="admin-login__field">
            <label htmlFor="field-password">Password</label>
            <input
              id="field-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <button className="btn btn--primary admin-login__submit" type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginView
