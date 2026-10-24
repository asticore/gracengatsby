/**
 * Byte helpers for WebAuthn: base64url (the wire format of every binary field in
 * the ceremony), constant-time comparison, and byte concatenation. Web Crypto only,
 * so this file runs on the edge as well as in Node.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

export const toBase64Url = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]
  }
  return out
}

/** Strict decoder: rejects characters outside the URL-safe alphabet and impossible lengths. Returns null instead of throwing. */
export const fromBase64Url = (text: string): Uint8Array | null => {
  if (typeof text !== 'string' || text.length === 0 || text.length % 4 === 1 || /[^A-Za-z0-9_-]/.test(text)) return null
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4))
  let buffer = 0
  let bits = 0
  let index = 0
  for (const char of text) {
    buffer = (buffer << 6) | ALPHABET.indexOf(char)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[index++] = (buffer >> bits) & 0xff
    }
  }
  return bytes.subarray(0, index)
}

export const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>

export const concatBytes = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total) as Uint8Array<ArrayBuffer>
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Compares two strings in constant time (used for challenges and origins, which are not secret but should not leak by timing). */
export const textEqual = (a: string, b: string): boolean => bytesEqual(utf8(a), utf8(b))

export const randomBytes = (length: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(length) as Uint8Array<ArrayBuffer>
  crypto.getRandomValues(out)
  return out
}

export const sha256 = async (data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))
