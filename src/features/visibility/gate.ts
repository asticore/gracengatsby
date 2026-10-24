/**
 * Check if a document requires a password to access.
 * Returns 'locked' if the document has a password and no valid unlock cookie is present.
 * Returns 'open' if the document is accessible.
 */

import type { cookies as getCookies } from 'next/headers'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { verifyUnlockToken } from './password'
import { getDb } from '@/cms/db/connect'

export type PasswordGateState = 'open' | 'locked'

const GATED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])

async function evaluateGate(collection: string, id: number, readCookie: (name: string) => string | undefined): Promise<PasswordGateState> {
  // Only these collections can be password protected
  if (!GATED_COLLECTIONS.has(collection)) {
    return 'open'
  }

  try {
    // "Visible to members of organisation X" (src/features/organizations/visibility.ts). Locked unless the visitor is a member; fails closed.
    const { orgGateLocked } = await import('@/features/organizations/visibility')
    if (await orgGateLocked(collection, id, readCookie('engage-token'))) return 'locked'

    const db = await getDb()
    const hash = await getPasswordHash(db, collection, id)

    // No password set, document is open
    if (!hash) {
      return 'open'
    }

    // Document has a password, check for valid unlock cookie
    const unlockToken = readCookie(`eg_unlock_${collection}_${id}`)

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
  return evaluateGate(collection, id, (name) => cookies.get(name)?.value)
}

function readCookieHeader(headers: Headers | null | undefined, name: string): string | undefined {
  const raw = headers?.get?.('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Same check for code that only has a request's headers (collection hooks,
 * route handlers). Missing headers mean no cookie, so a protected document is
 * 'locked' - fails closed for server-side callers that carry no visitor.
 */
export async function getPasswordGateStateForHeaders({
  collection,
  id,
  headers,
}: {
  collection: string
  id: number
  headers: Headers | null | undefined
}): Promise<PasswordGateState> {
  return evaluateGate(collection, id, (name) => readCookieHeader(headers, name))
}
