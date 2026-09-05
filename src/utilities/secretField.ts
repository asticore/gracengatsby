import crypto from 'crypto'
import type { FieldHook } from '@/engine'

/**
 * Encrypts/decrypts sensitive text fields (API keys, tokens) at rest using
 * AES-256-GCM, keyed off the same secret the app config uses: ENGAGE_SECRET
 * when set, otherwise PAYLOAD_SECRET (the engine-level env var whose name is
 * fixed by the underlying CMS engine). Keeping the order identical to
 * src/engage.config.ts matters - if the two ever disagreed, a deploy could
 * sign sessions with one key and decrypt stored secrets with another.
 *
 * This is defense-in-depth on top of the field/global-level admin-only access
 * control - even a raw DB dump doesn't hand over the plaintext key. Note the
 * consequence: changing the secret makes existing encrypted values
 * undecryptable, so they must be re-entered.
 *
 * Format stored in the DB: `enc:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>`
 */

const PREFIX = 'enc:v1:'

const getKey = (): Buffer => {
  const secret = process.env.ENGAGE_SECRET || process.env.PAYLOAD_SECRET || ''
  return crypto.createHash('sha256').update(secret).digest()
}

export const encryptSecretHook: FieldHook = ({ value }) => {
  if (typeof value !== 'string' || value.length === 0) return value
  // Already encrypted (e.g. re-saving the doc without touching this field) - don't double-encrypt.
  if (value.startsWith(PREFIX)) return value

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export const decryptSecretHook: FieldHook = ({ value }) => {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value

  try {
    const [ivHex, authTagHex, dataHex] = value.slice(PREFIX.length).split(':')
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    // If the secret rotated or the value is malformed, fail closed rather than throw.
    return ''
  }
}
