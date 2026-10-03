/**
 * Preview token signing and verification using WebCrypto (works on Workers and Node).
 * Token format: base64url(JSON {c,i,e}) + '.' + base64url(HMAC-SHA256(payload, secret))
 *
 * Secret is derived from process.env.ENGAGE_SECRET using sha256 with a fixed suffix ':preview',
 * so the preview key differs from the JWT key.
 */

const PREVIEW_SECRET_SUFFIX = ':preview'
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

async function derivePreviewSecret(engageSecret: string): Promise<Uint8Array> {
  const combined = engageSecret + PREVIEW_SECRET_SUFFIX
  const encoder = new TextEncoder()
  const data = encoder.encode(combined)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return new Uint8Array(hashBuffer)
}

export interface PreviewTokenPayload {
  c: string // collection
  i: number // id
  e: number // expiresAt (unix timestamp in seconds)
}

/**
 * Sign a preview token for a document.
 * Returns the signed token string, or null if ENGAGE_SECRET is not set.
 */
export async function signPreviewToken({
  collection,
  id,
  ttlSeconds = 3600,
  now = Math.floor(Date.now() / 1000),
}: {
  collection: string
  id: number
  ttlSeconds?: number
  now?: number
}): Promise<string | null> {
  const engageSecret = process.env.ENGAGE_SECRET || ''
  if (!engageSecret) return null

  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Invalid collection: ${collection}`)
  }
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid id: ${id}`)
  }

  const payload: PreviewTokenPayload = {
    c: collection,
    i: id,
    e: now + ttlSeconds,
  }

  const encoder = new TextEncoder()
  const payloadStr = JSON.stringify(payload)
  const payloadBytes = encoder.encode(payloadStr)
  const payloadB64 = base64urlEncode(payloadBytes)

  const secret = await derivePreviewSecret(engageSecret)
  const signKey = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBuffer = await crypto.subtle.sign('HMAC', signKey, encoder.encode(payloadB64) as BufferSource)
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer))

  return `${payloadB64}.${signatureB64}`
}

/**
 * Verify and parse a preview token.
 * Returns the payload if valid and not expired, or null otherwise.
 */
export async function verifyPreviewToken(
  token: string,
  { now = Math.floor(Date.now() / 1000) }: { now?: number } = {}
): Promise<PreviewTokenPayload | null> {
  const engageSecret = process.env.ENGAGE_SECRET || ''
  if (!engageSecret) return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, signatureB64] = parts

  // Verify signature
  try {
    const secret = await derivePreviewSecret(engageSecret)
    const signKey = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const encoder = new TextEncoder()
    const signatureBytes = base64urlDecode(signatureB64)

    const isValid = await crypto.subtle.verify('HMAC', signKey, signatureBytes as BufferSource, encoder.encode(payloadB64) as BufferSource)
    if (!isValid) return null
  } catch {
    return null
  }

  // Decode payload
  let payload: PreviewTokenPayload
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
