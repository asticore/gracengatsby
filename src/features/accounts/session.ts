import { cookies, headers } from 'next/headers'
import type { Engine, TypedUser } from '@/engine'

import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import type { FeatureFlags } from '@/features/registry'
import { SESSION_COOKIE, loginProtectionAuth } from '@/features/security'

/**
 * Who is asking, and whether this feature is switched on.
 *
 * The identity comes from the session cookie and from nowhere else. No screen,
 * action or query in this feature ever takes a customer id from a form field,
 * a query string or a route parameter - if it did, changing a number in the
 * address bar would be enough to read somebody else's account.
 */

export type AccountUser = TypedUser

export type AccountContext = {
  engine: Engine
  flags: FeatureFlags
  user: AccountUser | null
}

export const accountContext = async (): Promise<AccountContext> => {
  const engine = await getEngine()
  const [flags, auth] = await Promise.all([
    getFeatureFlags(),
    engine
      .auth({ headers: await headers() })
      .catch((): { user: AccountUser | null } => ({ user: null })),
  ])

  return { engine, flags, user: auth.user ?? null }
}

/**
 * Signs the session cookie in.
 *
 * The engine's local login mints the token but, unlike the HTTP route, leaves
 * the cookie to the caller. Same name the rest of the system already reads
 * (the admin area, the session cap in the request guard), so one sign-in works
 * everywhere and one sign-out ends it everywhere. `httpOnly` keeps it away
 * from any script on the page; `lax` still allows a normal link back into the
 * site to arrive signed in, while keeping the cookie off cross-site POSTs.
 */
export const setSessionCookie = async (token: string): Promise<void> => {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: loginProtectionAuth().tokenExpiration,
  })
}

export const clearSessionCookie = async (): Promise<void> => {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/**
 * The caller's address, for rate limiting.
 *
 * CF-Connecting-IP is set by the edge and cannot be forged; the others are
 * fallbacks for local development. Anything unidentifiable shares one bucket,
 * because being unidentifiable should not buy a bigger allowance.
 */
export const requestAddress = async (): Promise<string> => {
  const incoming = await headers()
  return (
    incoming.get('cf-connecting-ip') ||
    incoming.get('x-real-ip') ||
    incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

/** Where the site lives, for links inside emails. */
export const siteOrigin = async (): Promise<string> => {
  const incoming = await headers()
  const configured = process.env.NEXT_PUBLIC_SERVER_URL || process.env.ENGAGE_SERVER_URL
  if (configured) return configured.replace(/\/$/, '')

  const host = incoming.get('host') || 'localhost:3000'
  const protocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  return `${protocol}://${host}`
}
