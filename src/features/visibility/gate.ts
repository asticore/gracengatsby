/**
 * Check if a document requires a password to access.
 * Returns 'locked' if the document has a password and no valid unlock cookie is present.
 * Returns 'open' if the document is accessible.
 */

import { cookies as getCookies } from 'next/headers'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { verifyUnlockToken } from './password'
import { getDb } from '@/cms/db/connect'

export type PasswordGateState = 'open' | 'locked'

/**
 * Determine if a document is gated by a password.
 * Checks: does the document have a stored password, and does the request have a valid unlock token?
 */
export async function getPasswordGateState({
  collection,
  id,
  cookies,
}: {
  collection: string
  id: number
  cookies: Awaited<ReturnType<typeof getCookies>>
}): Promise<PasswordGateState> {
  // Only pages and posts can be password protected
  if (collection !== 'pages' && collection !== 'posts') {
    return 'open'
  }

  try {
    const db = await getDb()
    const hash = await getPasswordHash(db, collection, id)

    // No password set, document is open
    if (!hash) {
      return 'open'
    }

    // Document has a password, check for valid unlock cookie
    const cookieName = `eg_unlock_${collection}_${id}`
    const unlockToken = cookies.get(cookieName)?.value

    if (!unlockToken) {
      return 'locked'
    }

    // Verify the token
    const payload = await verifyUnlockToken(unlockToken)
    if (!payload || payload.c !== collection || payload.i !== id || payload.h !== hash.slice(-16)) {
      return 'locked'
    }

    // Token is valid
    return 'open'
  } catch (error) {
    console.error('Error checking password gate state:', error)
    // On error, default to locked to be safe
    return 'locked'
  }
}
