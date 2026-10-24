import { fromBase64Url, randomBytes, textEqual, toBase64Url, utf8 } from './encoding'

/**
 * The challenge a ceremony must sign, carried in a signed, HttpOnly, short-lived
 * cookie (the same approach as the social login state cookie). The cookie holds
 * the challenge, which ceremony it belongs to, and for registration the user it
 * was issued to. HMAC-SHA-256 with ENGAGE_SECRET; no secret means no passkeys.
 */

export const PASSKEY_CHALLENGE_COOKIE = 'eg_passkey_ch'
export const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000

export type ChallengeKind = 'register' | 'login'
export type IssuedChallenge = { challenge: string; kind: ChallengeKind; userId: number | null }

const hmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

const sign = async (secret: string, payload: string): Promise<string> =>
  toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), utf8(payload))))

/** A fresh 32-byte challenge and the cookie value that carries it. */
export async function issueChallenge(
  secret: string,
  kind: ChallengeKind,
  userId: number | null,
  now: number,
): Promise<{ challenge: string; cookie: string }> {
  if (!secret) throw new Error('passkeys need ENGAGE_SECRET')
  const challenge = toBase64Url(randomBytes(32))
  const payload = toBase64Url(utf8(JSON.stringify({ c: challenge, k: kind, u: userId, iat: now })))
  return { challenge, cookie: `${payload}.${await sign(secret, payload)}` }
}

/** The challenge the cookie was issued for, or null when the signature, age or kind does not match. */
export async function readChallenge(
  secret: string,
  cookie: string | null | undefined,
  kind: ChallengeKind,
  now: number,
): Promise<IssuedChallenge | null> {
  if (!secret || !cookie) return null
  const parts = cookie.split('.')
  if (parts.length !== 2) return null
  if (!textEqual(parts[1], await sign(secret, parts[0]))) return null
  const bytes = fromBase64Url(parts[0])
  if (!bytes) return null
  let data: { c?: unknown; k?: unknown; u?: unknown; iat?: unknown }
  try {
    data = JSON.parse(new TextDecoder().decode(bytes)) as typeof data
  } catch {
    return null
  }
  if (typeof data.c !== 'string' || data.k !== kind) return null
  const age = now - Number(data.iat)
  if (!Number.isFinite(age) || age < 0 || age > CHALLENGE_MAX_AGE_MS) return null
  const userId = typeof data.u === 'number' ? data.u : null
  return { challenge: data.c, kind, userId }
}
