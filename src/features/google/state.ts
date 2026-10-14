import crypto from 'crypto'

/**
 * The sign-in "state" value that ties the Google redirect back to the browser
 * that started it. It is signed with ENGAGE_SECRET and must match a cookie that
 * only that browser holds, so a link planted by another site cannot complete a
 * connection. It is valid for ten minutes.
 *
 * Shape: <nonce>.<issued-at ms>.<HMAC-SHA256 of the first two parts, base64url>
 */

export const STATE_MAX_AGE_MS = 10 * 60 * 1000

const sign = (payload: string, secret: string): string => crypto.createHmac('sha256', secret).update(payload).digest('base64url')

const sameText = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/** A fresh state value and the nonce to store in the cookie. Pass the secret; never empty. */
export function createOauthState(secret: string, now: number = Date.now()): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString('base64url')
  const payload = `${nonce}.${now}`
  return { state: `${payload}.${sign(payload, secret)}`, nonce }
}

/** True only when the state is intact, belongs to this browser's cookie and is still fresh. */
export function verifyOauthState(state: string | null, cookieNonce: string | null, secret: string, now: number = Date.now()): boolean {
  if (!state || !cookieNonce || !secret) return false
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, issued, signature] = parts
  if (!sameText(signature, sign(`${nonce}.${issued}`, secret))) return false
  if (!sameText(nonce, cookieNonce)) return false
  const age = now - Number(issued)
  return Number.isFinite(age) && age >= 0 && age <= STATE_MAX_AGE_MS
}
