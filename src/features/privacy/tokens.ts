import { createHash, randomBytes } from 'crypto'

/**
 * Tokens for the emailed deletion link. Server only: the client screens import core.ts, which must stay free of Node modules.
 */

/** A fresh random token for the emailed link, and its SHA-256 (the only part that is stored). */
export function newVerifyToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashVerifyToken(token) }
}

export function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
