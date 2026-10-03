/**
 * Token generation and verification for signed preview links.
 * Uses HMAC-SHA256 for cryptographic signatures, with tokens valid for 1 hour.
 *
 * Format: base64url(HMAC-SHA256(secret, collection|id|issued)) + '.' + base64url(issued + ttl)
 * - This gives us integrity checking (HMAC) and expiry without needing a database.
 */

function base64urlEncode(data: Uint8Array): string {
  const binary = String.fromCharCode(...data)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4)
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return new Uint8Array(binary.split('').map((c) => c.charCodeAt(0)))
}

async function derivePreviewSecret(engageSecret: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`preview:${engageSecret}`)

  const keyData = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(keyData)
}

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

export interface PreviewTokenPayload {
  collection: string
  id: number
  ttlSeconds: number
}

export async function signPreviewToken(payload: PreviewTokenPayload): Promise<string | null> {
  try {
    const engageSecret = process.env.ENGAGE_SECRET
    if (!engageSecret) return null

    const secret = await derivePreviewSecret(engageSecret)

    const issuedAt = Math.floor(Date.now() / 1000)
    const message = `${payload.collection}|${payload.id}|${issuedAt}`
    const encoder = new TextEncoder()
    const messageData = encoder.encode(message)

    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, messageData)

    const signatureb64 = base64urlEncode(new Uint8Array(signature))

    const metadataData = new Uint8Array(8)
    const view = new DataView(metadataData.buffer)
    view.setUint32(0, issuedAt, false)
    view.setUint32(4, payload.ttlSeconds, false)
    const metadatab64 = base64urlEncode(metadataData)

    return `${signatureb64}.${metadatab64}`
  } catch {
    return null
  }
}

export async function verifyPreviewToken(token: string, expectedPayload: Omit<PreviewTokenPayload, 'ttlSeconds'>): Promise<boolean> {
  try {
    const engageSecret = process.env.ENGAGE_SECRET
    if (!engageSecret) return false

    const [signatureb64, metadatab64] = token.split('.')
    if (!signatureb64 || !metadatab64) return false

    const secret = await derivePreviewSecret(engageSecret)
    const metadata = base64urlDecode(metadatab64)

    if (metadata.length !== 8) return false

    const view = new DataView(metadata.buffer)
    const issuedAt = view.getUint32(0, false)
    const ttlSeconds = view.getUint32(4, false)

    const now = Math.floor(Date.now() / 1000)
    if (now > issuedAt + ttlSeconds) return false

    const message = `${expectedPayload.collection}|${expectedPayload.id}|${issuedAt}`
    const encoder = new TextEncoder()
    const messageData = encoder.encode(message)

    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const expectedSignature = base64urlDecode(signatureb64)

    const isValid = await crypto.subtle.verify('HMAC', key, expectedSignature, messageData)
    return isValid
  } catch {
    return false
  }
}
