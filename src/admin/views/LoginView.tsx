'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Admin login form - simple email/password auth with POST to /api/users/login.
 * On success, stores auth token via Set-Cookie header (credentials: 'include')
 * and redirects to the protected admin dashboard. On failure, shows error message
 * from the server or a generic fallback. Disables inputs during submission.
 */
export function LoginView({ redirectTo = '/admin' }: { redirectTo?: string } = {}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
        router.push(redirectTo)
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
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginView
