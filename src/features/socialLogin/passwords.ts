import { createHmac } from 'crypto'

import { verifyPassword } from '@/localapi/auth'

/**
 * Accounts created by social sign-in still need a password column value, but
 * nobody must be able to use it. It is an HMAC of the address under
 * ENGAGE_SECRET: unguessable, never shown, and recognisable by us - which is
 * how "this person has no password of their own" is told without a new column.
 * Setting or resetting a real password replaces it, and the account then
 * counts as having one.
 *
 * If ENGAGE_SECRET is ever rotated, old placeholders stop being recognised and
 * those accounts read as "has a password". The worst case is that such a
 * person could disconnect their only provider; Forgotten password still works.
 */

export const placeholderPassword = (secret: string, email: string): string =>
  createHmac('sha256', secret).update(`social-no-password:${email.trim().toLowerCase()}`).digest('hex')

/** True when the stored hash is NOT one of the placeholders, i.e. the person has set a real password. */
export function hasRealPassword(
  row: { salt?: string | null; hash?: string | null; email?: string | null } | null,
  secret: string,
  extraEmails: Array<string | null> = [],
): boolean {
  if (!row || typeof row.salt !== 'string' || typeof row.hash !== 'string') return false
  const emails = new Set([row.email, ...extraEmails].filter((e): e is string => typeof e === 'string' && e.length > 0))
  for (const email of emails) {
    if (verifyPassword(placeholderPassword(secret, email), row.salt, row.hash)) return false
  }
  return true
}
