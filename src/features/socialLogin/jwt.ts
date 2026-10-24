import { b64urlDecode, b64urlEncode } from './util'

/**
 * ID token verification and Apple's client-secret JWT, on Web Crypto only.
 *
 * Only RS256 is accepted for verification (Google, Microsoft and Apple all sign
 * with it); `alg: none`, HMAC and anything else are refused outright, which
 * closes the usual algorithm-confusion holes.
 */

export type Claims = Record<string, unknown>
export type Fetcher = typeof fetch

type Jwk = JsonWebKey & { kid?: string }
type CachedKeys = { keys: Jwk[]; fetchedAt: number }

const JWKS_TTL_MS = 60 * 60 * 1000
/** A token naming an unknown key id may trigger a re-fetch, but not more often than this. */
const JWKS_REFETCH_MIN_MS = 5 * 60 * 1000
const CLOCK_SKEW_S = 60

const jwksCache = new Map<string, CachedKeys>()

export const clearJwksCache = (): void => jwksCache.clear()

async function loadKeys(url: string, fetchImpl: Fetcher, now: number, force: boolean): Promise<Jwk[]> {
  const cached = jwksCache.get(url)
  if (cached && !force && now - cached.fetchedAt < JWKS_TTL_MS) return cached.keys
  if (cached && force && now - cached.fetchedAt < JWKS_REFETCH_MIN_MS) return cached.keys
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('jwks-unavailable')
  const body = (await response.json()) as { keys?: Jwk[] }
  const keys = Array.isArray(body.keys) ? body.keys : []
  jwksCache.set(url, { keys, fetchedAt: now })
  return keys
}

const parseJson = (bytes: Uint8Array): Record<string, unknown> | null => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes))
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export type IdTokenExpectations = {
  jwksUrl: string
  audience: string
  nonce: string
  issuerOk: (iss: string, claims: Claims) => boolean
  fetchImpl: Fetcher
  /** Milliseconds; injectable for tests. */
  now?: number
}

export class TokenError extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

/** Verifies signature, issuer, audience, expiry and nonce. Throws TokenError with a short reason. */
export async function verifyIdToken(token: string, expect: IdTokenExpectations): Promise<Claims> {
  const now = expect.now ?? Date.now()
  const parts = typeof token === 'string' ? token.split('.') : []
  if (parts.length !== 3 || parts.some((p) => !p)) throw new TokenError('malformed')

  let header: Record<string, unknown> | null
  let claims: Claims | null
  try {
    header = parseJson(b64urlDecode(parts[0]))
    claims = parseJson(b64urlDecode(parts[1]))
  } catch {
    throw new TokenError('malformed')
  }
  if (!header || !claims) throw new TokenError('malformed')
  if (header.alg !== 'RS256') throw new TokenError('alg')
  const kid = typeof header.kid === 'string' ? header.kid : ''
  if (!kid) throw new TokenError('kid')

  let keys: Jwk[]
  try {
    keys = await loadKeys(expect.jwksUrl, expect.fetchImpl, now, false)
    if (!keys.some((k) => k.kid === kid)) keys = await loadKeys(expect.jwksUrl, expect.fetchImpl, now, true)
  } catch {
    throw new TokenError('jwks')
  }
  const jwk = keys.find((k) => k.kid === kid && (!k.kty || k.kty === 'RSA'))
  if (!jwk) throw new TokenError('kid')

  let valid = false
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
  } catch {
    valid = false
  }
  if (!valid) throw new TokenError('signature')

  const nowS = Math.floor(now / 1000)
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < nowS) throw new TokenError('expired')
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > nowS) throw new TokenError('not-yet-valid')
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > nowS) throw new TokenError('not-yet-valid')
  if (typeof claims.iss !== 'string' || !expect.issuerOk(claims.iss, claims)) throw new TokenError('issuer')

  const aud = claims.aud
  const audOk = typeof aud === 'string' ? aud === expect.audience : Array.isArray(aud) && aud.includes(expect.audience)
  if (!expect.audience || !audOk) throw new TokenError('audience')

  if (!expect.nonce || claims.nonce !== expect.nonce) throw new TokenError('nonce')
  if (typeof claims.sub !== 'string' || !claims.sub) throw new TokenError('subject')
  return claims
}

const pemToDer = (pem: string): Uint8Array<ArrayBuffer> => {
  const body = pem.replace(/-----BEGIN [A-Z ]+-----/g, '').replace(/-----END [A-Z ]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(body)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Apple wants the client secret to be a short-lived ES256 JWT signed with the .p8 key. */
export async function appleClientSecret(
  args: { teamId: string; keyId: string; clientId: string; privateKey: string },
  now: number = Date.now(),
): Promise<string> {
  const iat = Math.floor(now / 1000)
  const header = b64urlEncode(JSON.stringify({ alg: 'ES256', kid: args.keyId, typ: 'JWT' }))
  const payload = b64urlEncode(
    JSON.stringify({ iss: args.teamId, iat, exp: iat + 300, aud: 'https://appleid.apple.com', sub: args.clientId }),
  )
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(args.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // Web Crypto returns the raw r||s form JWTs use, not DER.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`)),
  )
  return `${header}.${payload}.${b64urlEncode(signature)}`
}
