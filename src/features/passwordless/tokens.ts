/**
 * The secrets behind an emailed link or code.
 *
 * A link is 32 random bytes; only its SHA-256 is stored, so a database read never
 * yields a working link. A code is six digits, which is too few to hash alone, so
 * it is stored as `salt:sha256(salt:code)` with a fresh 16-byte salt per row.
 */

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

export const randomHex = (bytes: number): string => toHex(crypto.getRandomValues(new Uint8Array(bytes)))

export const sha256Hex = async (text: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))

/** A wrong code is counted; the token dies after this many. */
export const MAX_CODE_ATTEMPTS = 5

/** Uniform six-digit code. Rejection sampling avoids the modulo bias of a plain `% 1000000`. */
export const newCode = (): string => {
  const range = 4294967296
  const limit = range - (range % 1_000_000)
  for (;;) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0]
    if (value < limit) return String(value % 1_000_000).padStart(6, '0')
  }
}

/** The stored form of a code: `salt:hash`. */
export const codeHash = async (code: string, salt: string = randomHex(16)): Promise<string> =>
  `${salt}:${await sha256Hex(`${salt}:${code}`)}`

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** True when `code` matches a stored `salt:hash`. A malformed value never matches. */
export const checkCode = async (stored: string, code: string): Promise<boolean> => {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const recomputed = await codeHash(code, salt)
  return sameText(recomputed.split(':')[1] ?? '', hash)
}
