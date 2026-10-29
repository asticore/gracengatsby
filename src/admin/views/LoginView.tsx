'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { useAdminRoot } from '@/admin/adminRoute/AdminRouteProvider'

import { useEffect, useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PasskeySignInButton } from '@/features/passkeys/components/PasskeySignInButton'
import { SecondFactorChoice, type SecondFactorMethod } from '@/features/security/components/SecondFactorChoice'

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
export function LoginView({ redirectTo: redirectToProp }: { redirectTo?: string } = {}) {
  const root = useAdminRoot()
  const redirectTo = redirectToProp ?? root
  const t = useAdminT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Set when the password was right and the account needs a two-step code.
  const [pendingToken, setPendingToken] = useState('')
  const [code, setCode] = useState('')
  const [method, setMethod] = useState<SecondFactorMethod>('app')
  const [trust, setTrust] = useState(false)
  // Social sign-in for staff: buttons only when the site allows it and a provider is configured.
  const [socialProviders, setSocialProviders] = useState<Array<{ id: string; label: string }>>([])
  const socialError = searchParams.get('social_error')
  // Emailed sign-in for staff: only when the owner allowed admins to use it. The server checks again.
  const [pwOptions, setPwOptions] = useState({ magicLink: false, emailCode: false })
  const [passkeyOn, setPasskeyOn] = useState(false)
  const [pwStep, setPwStep] = useState<'choose' | 'code'>('choose')
  const [pwCode, setPwCode] = useState('')
  const [pwNote, setPwNote] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/social/providers?area=admin', { credentials: 'include' })
      .then((r): Promise<{ providers?: Array<{ id: string; label: string }> }> => (r.ok ? r.json() : Promise.resolve({ providers: [] as Array<{ id: string; label: string }> })))
      .then((body: { providers?: Array<{ id: string; label: string }> }) => {
        if (!cancelled) setSocialProviders(Array.isArray(body.providers) ? body.providers : [])
      })
      .catch((): undefined => undefined)
    // A social sign-in that still needs its two-step code parked its pending token in a cookie.
    if (searchParams.get('social') === '2fa') {
      fetch('/api/social/pending', { credentials: 'include' })
        .then((r): Promise<{ pendingToken?: string | null }> => r.json())
        .then((body: { pendingToken?: string | null }) => {
          if (!cancelled && body.pendingToken) setPendingToken(body.pendingToken)
        })
        .catch((): undefined => undefined)
    }
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // Check if session expired and get redirect target
  const isSessionExpired = searchParams.get('expired') === '1'
  const finalRedirectTo = useMemo(() => {
    const redirectParam = searchParams.get('redirect')
    // Only use redirect if it's a relative path starting with /admin
    if (redirectParam && typeof redirectParam === 'string' && redirectParam.startsWith(root) && !redirectParam.startsWith('//')) {
      return redirectParam
    }
    return redirectTo
  }, [searchParams, redirectTo, root])

  useEffect(() => {
    fetch('/api/passkeys/availability?area=admin', { credentials: 'include' })
      .then((response) => response.json() as Promise<{ enabled?: boolean }>)
      .then((body) => setPasskeyOn(Boolean(body.enabled)))
      .catch((): undefined => undefined)
  }, [])

  useEffect(() => {
    fetch('/api/passwordless/options?area=admin', { credentials: 'include' })
      .then((response) => response.json() as Promise<{ magicLink?: boolean; emailCode?: boolean }>)
      .then((body) =>
        setPwOptions({ magicLink: Boolean(body.magicLink), emailCode: Boolean(body.emailCode) }),
      )
      .catch((): undefined => undefined)
  }, [])

  const requestEmailed = async (kind: 'link' | 'code') => {
    if (!email) {
      setPwNote('Enter your email address first.')
      return
    }
    setPwNote('')
    try {
      const response = await fetch('/api/passwordless/request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, kind, next: finalRedirectTo }),
      })
      const body = (await response.json()) as { message?: string }
      setPwNote(body.message ?? 'That did not work.')
      if (response.ok && kind === 'code') setPwStep('code')
    } catch {
      setPwNote('Network error. Please try again.')
    }
  }

  const verifyEmailed = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPwNote('')
    try {
      const response = await fetch('/api/passwordless/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: pwCode, next: finalRedirectTo }),
      })
      const body = (await response.json()) as { ok?: boolean; redirect?: string; pendingToken?: string; message?: string }
      if (response.ok && body.ok) {
        router.push(body.redirect ?? finalRedirectTo)
        router.refresh()
        return
      }
      if (body.pendingToken) {
        setPendingToken(body.pendingToken)
        setPwStep('choose')
        return
      }
      setPwNote(body.message ?? 'That code was not right.')
    } catch {
      setPwNote('Network error. Please try again.')
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch(pendingToken ? '/api/users/login-2fa' : '/api/users/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingToken ? { pendingToken, code, method, trustDevice: trust } : { email, password }),
      })

      const body = (await response.json()) as { errors?: Array<{ message?: string }>; twoFactorRequired?: boolean; pendingToken?: string }

      if (response.ok && body.twoFactorRequired && body.pendingToken) {
        setPendingToken(body.pendingToken)
        setPassword('')
        return
      }

      if (response.ok) {
        router.push(finalRedirectTo)
        router.refresh()
        return
      }

      const errorMessage = body.errors?.[0]?.message ?? (pendingToken ? 'That code was not right.' : 'Login failed. Check your email and password.')
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
        <h1 className="admin-login__title">{t('login.heading')}</h1>

        <form onSubmit={handleSubmit}>
          {isSessionExpired && (
            <div className="admin-login__notice">Your session expired. Please log in again.</div>
          )}
          {error && <div className="admin-login__error">{error}</div>}
          {socialError && !error && <div className="admin-login__error">That sign-in did not work. Use your email and password, or try again.</div>}

          {pendingToken ? (
            <div className="admin-login__field">
              <label htmlFor="field-code">Authentication code</label>
              <input
                id="field-code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isLoading}
                autoFocus
                required
              />
              <p className="admin-login__hint">
                {method === 'email'
                  ? 'Enter the 6-digit code we emailed you.'
                  : 'Enter the 6-digit code from your authenticator app, or one of your backup codes.'}
              </p>
              <SecondFactorChoice pendingToken={pendingToken} method={method} onMethod={setMethod} trust={trust} onTrust={setTrust} disabled={isLoading} />
            </div>
          ) : (
            <>
          <div className="admin-login__field">
            <label htmlFor="field-email">{t('login.email')}</label>
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
            <label htmlFor="field-password">{t('login.password')}</label>
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
            </>
          )}

          <button className="btn btn--primary admin-login__submit" type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in...' : pendingToken ? 'Verify' : t('login.submit')}
          </button>
        </form>

        {!pendingToken && passkeyOn && <PasskeySignInButton next={finalRedirectTo} area="admin" onTwoFactor={setPendingToken} />}

        {!pendingToken && (pwOptions.magicLink || pwOptions.emailCode) && (
          <div className="admin-login__passwordless">
            {pwStep === 'code' ? (
              <form onSubmit={verifyEmailed}>
                <div className="admin-login__field">
                  <label htmlFor="field-pw-code">Code from your email</label>
                  <input
                    id="field-pw-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={pwCode}
                    onChange={(e) => setPwCode(e.target.value)}
                    required
                  />
                </div>
                <button className="btn btn--primary admin-login__submit" type="submit">
                  Sign in with code
                </button>
              </form>
            ) : (
              <div>
                {pwOptions.magicLink && (
                  <button type="button" className="btn btn--style-secondary admin-login__submit" onClick={() => requestEmailed('link')}>
                    Email me a sign-in link
                  </button>
                )}
                {pwOptions.emailCode && (
                  <button type="button" className="btn btn--style-secondary admin-login__submit" onClick={() => requestEmailed('code')}>
                    Email me a code
                  </button>
                )}
              </div>
            )}
            {pwNote && <p className="admin-login__hint">{pwNote}</p>}
          </div>
        )}

        {!pendingToken && socialProviders.length > 0 && (
          <div className="admin-login__social">
            {socialProviders.map((p) => (
              <a
                key={p.id}
                className="btn btn--style-secondary admin-login__submit"
                href={`/api/social/${p.id}/start?area=admin&next=${encodeURIComponent(finalRedirectTo)}`}
              >
                Continue with {p.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LoginView
