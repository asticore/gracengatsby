/**
 * Password-based encryption for settings exports.
 *
 * Uses WebCrypto only (no node:crypto), so the same code runs in Cloudflare
 * Workers, Node test runs and the browser. The key is derived with
 * PBKDF2-SHA256 and the payload sealed with AES-256-GCM, which authenticates
 * the data: a wrong password and a tampered file both fail the same way.
 */

export const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256
const ENVELOPE_VERSION = 1

export type EncryptedEnvelope = {
  encrypted: true
  v: 1
  /** base64 */
  salt: string
  /** base64 */
  iv: string
  /** base64 AES-GCM ciphertext (includes the auth tag) */
  data: string
}

/** Thrown when the password is wrong or the file has been altered. */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DecryptionError'
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('WebCrypto is not available in this runtime.')
  return subtle
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.encrypted === true &&
    candidate.v === ENVELOPE_VERSION &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.data === 'string'
  )
}

/** Encrypts any JSON-serialisable value with a password. */
export async function encryptJson(value: unknown, password: string): Promise<EncryptedEnvelope> {
  if (!password) throw new Error('A password is required to encrypt this file.')

  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = await deriveKey(password, salt)
  const plaintext = encoder.encode(JSON.stringify(value))
  const ciphertext = await getSubtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext)

  return {
    encrypted: true,
    v: ENVELOPE_VERSION,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  }
}

/**
 * Decrypts an envelope made by `encryptJson`. Throws `DecryptionError` when
 * the password is wrong or the envelope has been changed.
 */
export async function decryptJson(envelope: unknown, password: string): Promise<unknown> {
  if (!isEncryptedEnvelope(envelope)) {
    throw new DecryptionError('This file is not an encrypted settings export.')
  }
  if (!password) throw new DecryptionError('This export is encrypted. Enter its password.')

  let salt: Uint8Array<ArrayBuffer>
  let iv: Uint8Array<ArrayBuffer>
  let data: Uint8Array<ArrayBuffer>
  try {
    salt = fromBase64(envelope.salt)
    iv = fromBase64(envelope.iv)
    data = fromBase64(envelope.data)
  } catch {
    throw new DecryptionError('The encrypted export is damaged and cannot be read.')
  }

  let plaintext: ArrayBuffer
  try {
    const key = await deriveKey(password, salt)
    plaintext = await getSubtle().decrypt({ name: 'AES-GCM', iv }, key, data)
  } catch {
    throw new DecryptionError('Wrong password, or the file has been changed since it was exported.')
  }

  try {
    return JSON.parse(decoder.decode(plaintext)) as unknown
  } catch {
    throw new DecryptionError('The decrypted export is not valid JSON.')
  }
}
