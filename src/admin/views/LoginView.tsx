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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#f5f5f5',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          padding: 32,
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: 400,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 24, textAlign: 'center', fontSize: 24 }}>Admin Login</h1>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div
              style={{
                backgroundColor: '#fee',
                border: '1px solid #fcc',
                color: '#c33',
                padding: 12,
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="field-email" style={{ fontSize: 14, fontWeight: 500 }}>
              Email
            </label>
            <input
              id="field-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
              style={{
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="field-password" style={{ fontSize: 14, fontWeight: 500 }}>
              Password
            </label>
            <input
              id="field-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              required
              style={{
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #ddd',
                borderRadius: 4,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: isLoading ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginTop: 8,
            }}
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginView
