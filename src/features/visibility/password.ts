/**
 * Password hashing, verification, and unlock token generation using WebCrypto.
 * Works on Workers and Node.js.
 *
 * Hash format: pbkdf2$100000$<salt b64url>$<hash b64url>
 * Unlock token: HMAC-SHA256 signed JSON with collection, id, expiry.
 */

const PBKDF2_ITERATIONS = 100000
const SALT_BYTES = 16
const HASH_BYTES = 32
const UNLOCK_SECRET_SUFFIX = ':unlock'
const ALLOWED_COLLECTIONS = new Set(['pages', 'posts'])

function base64urlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64urlDecode(str: string): Uint8Array {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/')
  padded += '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(padded)
  return new Uint8Array(Array.from(binary, (c) => c.charCodeAt(0)))
}

async function deriveUnlockSecret(engageSecret: string): Promise<Uint8Array> {
  const combined = engageSecret + UNLOCK_SECRET_SUFFIX
  const encoder = new TextEncoder()
  const data = encoder.encode(combined)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(hashBuffer)
}

/**
 * Hash a password using PBKDF2-SHA256.
 * Returns format: pbkdf2$100000$<salt b64url>$<hash b64url>
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))

  // Derive key using PBKDF2
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  const baseKey = await crypto.subtle.importKey('raw', passwordBuffer as BufferSource, 'PBKDF2', false, ['deriveBits'])

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    HASH_BYTES * 8
  )

  const hash = new Uint8Array(derivedBits)
  const saltB64 = base64urlEncode(salt)
  const hashB64 = base64urlEncode(hash)

  return `pbkdf2$${PBKDF2_ITERATIONS}$${saltB64}$${hashB64}`
}

/**
 * Verify a password against a stored hash.
 * Returns true if the password matches, false otherwise.
 * Constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false
  }

  const iterations = parseInt(parts[1], 10)
  if (iterations !== PBKDF2_ITERATIONS) {
    return false
  }

  let salt: Uint8Array
  let expectedHash: Uint8Array
  try {
    salt = base64urlDecode(parts[2])
    expectedHash = base64urlDecode(parts[3])
  } catch {
    return false
  }

  // Derive key from provided password
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  const baseKey = await crypto.subtle.importKey('raw', passwordBuffer as BufferSource, 'PBKDF2', false, ['deriveBits'])

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    HASH_BYTES * 8
  )

  const computedHash = new Uint8Array(derivedBits)

  // Constant-time comparison
  if (computedHash.length !== expectedHash.length) {
    return false
  }

  let isEqual = true
  for (let i = 0; i < computedHash.length; i++) {
    if (computedHash[i] !== expectedHash[i]) {
      isEqual = false
    }
  }

  return isEqual
}

export interface UnlockTokenPayload {
  c: string // collection
  i: number // id
  e: number // expiresAt (unix timestamp in seconds)
  h?: string // fingerprint of the stored hash, so changing the password revokes old cookies
}

/**
 * Sign an unlock token for a password-protected document.
 * Returns the signed token string, or null if ENGAGE_SECRET is not set.
 */
export async function signUnlockToken({
  collection,
  id,
  ttlSeconds = 604800, // 7 days
  now = Math.floor(Date.now() / 1000),
  fingerprint,
}: {
  collection: string
  id: number
  ttlSeconds?: number
  now?: number
  fingerprint?: string
}): Promise<string | null> {
  const engageSecret = process.env.ENGAGE_SECRET || ''
  if (!engageSecret) return null

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`)
  }
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid id: ${id}`)
  }

  const payload: UnlockTokenPayload = {
    c: collection,
    i: id,
    e: now + ttlSeconds,
    ...(fingerprint ? { h: fingerprint } : {}),
  }

  const encoder = new TextEncoder()
  const payloadStr = JSON.stringify(payload)
  const payloadBytes = encoder.encode(payloadStr)
  const payloadB64 = base64urlEncode(payloadBytes)

  const secret = await deriveUnlockSecret(engageSecret)
  const signKey = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBuffer = await crypto.subtle.sign('HMAC', signKey, encoder.encode(payloadB64) as BufferSource)
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer))

  return `${payloadB64}.${signatureB64}`
}

/**
 * Verify and parse an unlock token.
 * Returns the payload if valid and not expired, or null otherwise.
 */
export async function verifyUnlockToken(
  token: string,
  { now = Math.floor(Date.now() / 1000) }: { now?: number } = {}
): Promise<UnlockTokenPayload | null> {
  const engageSecret = process.env.ENGAGE_SECRET || ''
  if (!engageSecret) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, signatureB64] = parts

  // Verify signature
  try {
    const secret = await deriveUnlockSecret(engageSecret)
    const signKey = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const encoder = new TextEncoder()
    const signatureBytes = base64urlDecode(signatureB64)

    const isValid = await crypto.subtle.verify('HMAC', signKey, signatureBytes as BufferSource, encoder.encode(payloadB64) as BufferSource)
    if (!isValid) return null
  } catch {
    return null
  }

  // Decode payload
  let payload: UnlockTokenPayload
  try {
    const payloadBytes = base64urlDecode(payloadB64)
    const decoder = new TextDecoder()
    const payloadStr = decoder.decode(payloadBytes)
    payload = JSON.parse(payloadStr)
  } catch {
    return null
  }

  // Validate payload shape
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof payload.c !== 'string' ||
    !Number.isInteger(payload.i) ||
    typeof payload.e !== 'number'
  ) {
    return null
  }

  // Validate collection
  if (!ALLOWED_COLLECTIONS.has(payload.c)) {
    return null
  }

  // Validate id
  if (payload.i <= 0) {
    return null
  }

  // Check expiry
  if (now > payload.e) {
    return null
  }

  return payload
}

/**
 * Generate the cookie name for an unlock token.
 */
export function cookieName(collection: string, id: number): string {
  return `eg_unlock_${collection}_${id}`
}
