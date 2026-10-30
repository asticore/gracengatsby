import crypto from 'crypto'

/**
 * Signed OAuth state for the ad-platform sign-ins. The cookie holds the random
 * `state` value sent to the provider, the PKCE verifier (when the provider uses
 * one), the provider name, where to return, and the start time. It is HMAC-signed
 * with ENGAGE_SECRET and HttpOnly, so it never appears in a URL and a link planted
 * by another site cannot finish a connection. Valid for ten minutes.
 *
 * Shape: <base64url(JSON flow)>.<base64url(HMAC-SHA256 of the first part)>
 */

export const CONNECT_STATE_MAX_AGE_MS = 10 * 60 * 1000

export type ConnectFlow = {
  /** Provider the flow was started for. */
  p: string
  /** Random value sent to the provider as `state`. */
  s: string
  /** PKCE code verifier, '' when the provider does not use PKCE. */
  v: string
  /** Where to send the admin afterwards: the connections screen. */
  r: 'tracking'
  /** Issued at, ms since the epoch. */
  iat: number
}

const b64 = (input: Buffer | string): string => Buffer.from(input).toString('base64url')

const sign = (payload: string, secret: string): string => crypto.createHmac('sha256', secret).update(payload).digest('base64url')

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/** A random URL-safe string of about `bytes` random bytes. */
export const randomUrlToken = (bytes: number): string => crypto.randomBytes(bytes).toString('base64url')

/** The PKCE S256 challenge for a verifier (RFC 7636). */
export const pkceChallengeFor = (verifier: string): string => crypto.createHash('sha256').update(verifier).digest('base64url')

/** Seals a flow into the cookie value. Throws when there is no secret; the caller must check first. */
export function sealConnectFlow(secret: string, flow: ConnectFlow): string {
  if (!secret) throw new Error('no-secret')
  const payload = b64(JSON.stringify(flow))
  return `${payload}.${sign(payload, secret)}`
}

/**
 * Opens the cookie and returns the flow only when the signature holds, the
 * provider matches, the `state` query value equals the stored one, and the
 * flow is under ten minutes old. Otherwise null.
 */
export function openConnectFlow(
  secret: string,
  cookie: string | null | undefined,
  stateParam: string | null | undefined,
  provider: string,
  now: number = Date.now(),
): ConnectFlow | null {
  if (!secret || !cookie || !stateParam) return null
  const parts = cookie.split('.')
  if (parts.length !== 2) return null
  if (!sameText(parts[1], sign(parts[0], secret))) return null
  let flow: ConnectFlow
  try {
    flow = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as ConnectFlow
  } catch {
    return null
  }
  if (!flow || typeof flow !== 'object') return null
  if (flow.p !== provider || flow.r !== 'tracking') return null
  if (typeof flow.s !== 'string' || !sameText(flow.s, stateParam)) return null
  if (typeof flow.v !== 'string') return null
  const age = now - Number(flow.iat)
  if (!Number.isFinite(age) || age < 0 || age > CONNECT_STATE_MAX_AGE_MS) return null
  return flow
}
