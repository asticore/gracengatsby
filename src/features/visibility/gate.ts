/**
 * Check if a document requires a password to access.
 * Returns 'locked' if the document has a password and no valid unlock cookie is present.
 * Returns 'open' if the document is accessible.
 *
 * Signed-in member unlock is opt-in per call (`withAccount`), so only the public
 * detail pages ask for it. Cart, RSVP, ICS and embed callers keep cookie-only checks
 * and stay locked for role or tier unlocks.
 */

import type { cookies as getCookies } from 'next/headers'
import { headers as nextHeaders } from 'next/headers'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { getUnlockRules, type UnlockRules } from '@/cms/db/passwordGroups'
import { verifyUnlockToken } from './password'
import { getDb } from '@/cms/db/connect'
import { headersForCustomerView } from '@/features/impersonation/policy'
import { resolveEntitlement, type EngineQuery } from '@/features/members/entitlement'

export type PasswordGateState = 'open' | 'locked'

const GATED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])

/**
 * True when the signed-in viewer holds one of the item's unlock roles, or is on one of
 * its unlock tiers. Anonymous visitors, lookup failures and unknown users are all false.
 */
async function signedInViewerMayUnlock(rules: UnlockRules): Promise<boolean> {
  if (rules.roles.length === 0 && rules.tiers.length === 0) return false

  // Lazy import: the engine pulls in the whole config, which the cookie-only path never needs.
  const { getEngine } = await import('@/lib/engine')
  const engine = await getEngine()
  const auth = await engine
    .auth({ headers: headersForCustomerView(await nextHeaders()) })
    .catch((): { user: null } => ({ user: null }))
  const user = auth.user as { id?: number | string; roles?: string[] | null } | null
  if (!user) return false

  if (rules.roles.some((role) => user.roles?.includes(role))) return true

  if (rules.tiers.length > 0 && user.id !== undefined) {
    const entitlement = await resolveEntitlement(engine as unknown as EngineQuery, user.id)
    const tierId = entitlement.tier ? Number(entitlement.tier.id) : null
    if (tierId !== null && rules.tiers.includes(tierId)) return true
  }
  return false
}

async function evaluateGate(
  collection: string,
  id: number,
  readCookie: (name: string) => string | undefined,
  withAccount: boolean,
): Promise<PasswordGateState> {
  // Only these collections can be password protected
  if (!GATED_COLLECTIONS.has(collection)) {
    return 'open'
  }

  try {
    const db = await getDb()
    const hash = await getPasswordHash(db, collection, id)

    // No password set, document is open
    if (!hash) {
      return 'open'
    }

    // Document has a password: a valid unlock cookie opens it
    const unlockToken = readCookie(`eg_unlock_${collection}_${id}`)
    if (unlockToken) {
      const payload = await verifyUnlockToken(unlockToken)
      if (payload && payload.c === collection && payload.i === id && payload.h === hash.slice(-16)) {
        return 'open'
      }
    }

    // Or a signed-in viewer whose role or tier the item allows
    if (withAccount) {
      const rules = await getUnlockRules(db, collection, id)
      if (rules && (await signedInViewerMayUnlock(rules))) {
        return 'open'
      }
    }

    return 'locked'
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
  withAccount = false,
}: {
  collection: string
  id: number
  cookies: Awaited<ReturnType<typeof getCookies>>
  /** Also open for a signed-in viewer whose role or tier the item allows. Pages only. */
  withAccount?: boolean
}): Promise<PasswordGateState> {
  return evaluateGate(collection, id, (name) => cookies.get(name)?.value, withAccount)
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
 * Never opens for a signed-in role or tier: these callers are not detail pages.
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
  return evaluateGate(collection, id, (name) => readCookieHeader(headers, name), false)
}
