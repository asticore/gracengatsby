/**
 * Check if a document requires a password to access.
 * Returns 'locked' if the document has a password and no valid unlock cookie is present.
 * Returns 'open' if the document is accessible.
 */

import type { cookies as getCookies } from 'next/headers'
import { getPasswordHash } from '@/cms/db/contentPasswords'
import { getAccessRule, getGroup } from '@/cms/db/passwordGroups'
import { groupFingerprint, groupIsUsable, viewerQualifies, type Viewer } from './access'
import { GROUP_TOKEN_COLLECTION, groupCookieName, verifyUnlockToken } from './password'
import { getDb } from '@/cms/db/connect'

export type PasswordGateState = 'open' | 'locked'

const GATED_COLLECTIONS = new Set(['pages', 'posts', 'products', 'events'])

type ResolveViewer = () => Promise<Viewer | null>

/** The signed-in visitor of the current server-component request, or null. Never throws. */
export async function viewerFromRequestContext(): Promise<Viewer | null> {
  try {
    const { accountContext } = await import('@/features/accounts/session')
    const context = await accountContext()
    return { user: context.user, getEngine: async () => context.engine as never }
  } catch {
    return null
  }
}

/** The signed-in visitor behind a request's headers, or null. Never throws. */
function viewerFromHeaders(headers: Headers | null | undefined): ResolveViewer {
  return async () => {
    if (!headers) return null
    try {
      const { getEngine } = await import('@/lib/engine')
      const engine = await getEngine()
      const { user } = await engine.auth({ headers }).catch((): { user: null } => ({ user: null }))
      return { user: user as never, getEngine: async () => engine as never }
    } catch {
      return null
    }
  }
}

/**
 * Evaluates a shared-group or accounts rule. The decision is made from this request's own cookies and
 * session, every time. Anything unexpected (rule without a group, deleted group, expired group, group
 * passwords switched off, a bad token) stays locked.
 */
async function evaluateRule(
  db: Awaited<ReturnType<typeof getDb>>,
  rule: NonNullable<Awaited<ReturnType<typeof getAccessRule>>>,
  readCookie: (name: string) => string | undefined,
  resolveViewer: ResolveViewer,
): Promise<PasswordGateState> {
  if (rule.mode === 'accounts' && (await viewerQualifies(rule, await resolveViewer()))) return 'open'

  if (rule.groupId === null) return 'locked'
  const { readSecuritySettingsFromD1 } = await import('@/features/security/settings')
  const settings = await readSecuritySettingsFromD1()
  if (!settings.passwordGroups.enabled) return 'locked'

  const group = await getGroup(db, rule.groupId)
  if (!group || !groupIsUsable(group)) return 'locked'

  const token = readCookie(groupCookieName(group.id))
  if (!token) return 'locked'
  const payload = await verifyUnlockToken(token)
  if (!payload || payload.c !== GROUP_TOKEN_COLLECTION || payload.i !== group.id || payload.h !== groupFingerprint(group)) return 'locked'
  return 'open'
}

async function evaluateGate(
  collection: string,
  id: number,
  readCookie: (name: string) => string | undefined,
  resolveViewer: ResolveViewer = async () => null,
): Promise<PasswordGateState> {
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

    // No per-document password: a shared group or accounts rule may still protect it
    if (!hash) {
      const rule = await getAccessRule(db, collection, id)
      if (!rule) return 'open'
      return await evaluateRule(db, rule, readCookie, resolveViewer)
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
  return evaluateGate(collection, id, (name) => cookies.get(name)?.value, viewerFromRequestContext)
}

export type GateOptions = {
  signIn: boolean
  password: boolean
  /** Set when "members of an organisation only" is what locks the document: no password can unlock it. */
  org?: { name: string }
}

/**
 * What a locked visitor may be offered on the gate: signing in (accounts rule) and/or a password
 * (the document's own, or its group). Falls back to the password form alone when the lookup fails; the
 * document stays locked either way.
 */
export async function getGateOptions({ collection, id }: { collection: string; id: number }): Promise<GateOptions> {
  // The organisation restriction is checked before any password (see evaluateGate), so while it locks the
  // visitor out a password form would be a dead end: offer sign-in only. Once they are a member, the
  // normal options (a password, if one applies) take over.
  try {
    const { cookies } = await import('next/headers')
    const token = (await cookies()).get('engage-token')?.value
    const { orgGateInfo } = await import('@/features/organizations/visibility')
    const org = await orgGateInfo(collection, id, token)
    if (org) return { signIn: true, password: false, org }
  } catch {
    // fall through to the plain options; evaluateGate has already locked the document
  }
  try {
    const db = await getDb()
    const hash = await getPasswordHash(db, collection, id)
    if (hash) return { signIn: false, password: true }
    const rule = await getAccessRule(db, collection, id)
    if (!rule) return { signIn: false, password: true }
    let password = false
    if (rule.groupId !== null) {
      const { readSecuritySettingsFromD1 } = await import('@/features/security/settings')
      password = (await readSecuritySettingsFromD1()).passwordGroups.enabled && groupIsUsable(await getGroup(db, rule.groupId))
    }
    return { signIn: rule.mode === 'accounts', password }
  } catch {
    return { signIn: false, password: true }
  }
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
  return evaluateGate(collection, id, (name) => readCookieHeader(headers, name), viewerFromHeaders(headers))
}
