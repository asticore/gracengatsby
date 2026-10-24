'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { cookies, headers } from 'next/headers'

import { getEngine } from '@/lib/engine'

import { audit, auditContext, type AuditAction } from './auditLog'
import { SESSION_COOKIE } from './loginProtection'
import { hit } from './rateLimit'
import { getSecuritySettings } from './settings'
import {
  adminRevokeAllForAccount,
  adminRevokeSession,
  revokeOwnOtherSessions,
  revokeOwnSession,
  viewAccountSessions,
  viewOwnSessions,
  type SessionActor,
  type SessionDeps,
  type SessionOutcome,
  type SessionView,
} from './userSessionService'
import { defaultUserSessionStore } from './userSessionStore'
import { sessionIdFromToken } from './userSessions'

/**
 * What the session screens (admin and customer) call.
 *
 * The user is always the session's own, never an argument. The two admin-only
 * actions check the role on the server; hiding the controls is only a courtesy.
 */

const REVOKES_PER_MINUTE = 20

export type SessionListResult = { ok: boolean; message?: string; sessions: SessionView[] }

async function context() {
  const engine = await getEngine()
  const incoming = await headers()
  const { user } = await engine.auth({ headers: incoming }).catch((): { user: null } => ({ user: null }))
  const actor = user ? (user as unknown as SessionActor) : null
  const currentId = sessionIdFromToken((await cookies()).get(SESSION_COOKIE)?.value ?? null)

  const deps: SessionDeps = {
    store: defaultUserSessionStore,
    limited: (who) => hit(`sessions:revoke:${who.id}`, REVOKES_PER_MINUTE).limited,
    record: async (action: AuditAction, who, detail) => {
      try {
        const settings = await getSecuritySettings(engine as never)
        const origin = auditContext(new Request('https://engage.local', { headers: incoming }))
        await audit({ action, actorId: who.id, actorEmail: who.email, collectionSlug: 'users', detail, ...origin }, settings)
      } catch {
        // Never fail the action over a log line.
      }
    },
    emailFor: async (userId) => {
      const doc = (await engine.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true })) as { email?: string } | null
      return doc?.email ?? null
    },
  }
  return { engine, actor, currentId, deps }
}

const SIGNED_OUT: SessionOutcome = { ok: false, message: 'Your session has ended. Sign in and try again.' }

export async function mySessionsAction(): Promise<SessionListResult> {
  const { actor, currentId, deps } = await context()
  if (!actor) return { ...SIGNED_OUT, sessions: [] }
  try {
    return { ok: true, sessions: await viewOwnSessions(deps, actor, currentId) }
  } catch {
    return { ok: false, message: 'Your sessions could not be loaded just now.', sessions: [] }
  }
}

export async function revokeSessionAction(sessionId: string): Promise<SessionOutcome> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { actor, currentId, deps } = await context()
  if (!actor) return SIGNED_OUT
  try {
    return await revokeOwnSession(deps, actor, currentId, String(sessionId ?? ''))
  } catch {
    return { ok: false, message: 'That could not be done just now. Try again.' }
  }
}

export async function revokeOtherSessionsAction(): Promise<SessionOutcome> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { actor, currentId, deps } = await context()
  if (!actor) return SIGNED_OUT
  try {
    return await revokeOwnOtherSessions(deps, actor, currentId)
  } catch {
    return { ok: false, message: 'That could not be done just now. Try again.' }
  }
}

/** Admin only: the active sessions of the account with this email address. */
export async function accountSessionsAction(email: string): Promise<SessionListResult> {
  const { engine, actor, deps } = await context()
  if (!actor) return { ...SIGNED_OUT, sessions: [] }
  if (!actor.roles?.includes('admin')) return { ok: false, message: 'Only an administrator can do that.', sessions: [] }

  const address = String(email ?? '').trim().toLowerCase()
  if (!address) return { ok: false, message: 'Enter the email address of the account.', sessions: [] }
  const found = await engine.find({ collection: 'users', where: { email: { equals: address } }, limit: 1, depth: 0, overrideAccess: true })
  const target = found.docs[0] as { id: number } | undefined
  if (!target) return { ok: false, message: 'No account has that email address.', sessions: [] }

  const sessions = await viewAccountSessions(deps, actor, target.id)
  return { ok: true, sessions: sessions ?? [] }
}

/** Admin only: ends one session of any account. */
export async function adminRevokeSessionAction(sessionId: string): Promise<SessionOutcome> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { actor, deps } = await context()
  if (!actor) return SIGNED_OUT
  try {
    return await adminRevokeSession(deps, actor, String(sessionId ?? ''))
  } catch {
    return { ok: false, message: 'That could not be done just now. Try again.' }
  }
}

/** Admin only: ends every session of the account with this email address. */
export async function adminRevokeAllSessionsAction(email: string): Promise<SessionOutcome> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, message: blocked }

  const { engine, actor, deps } = await context()
  if (!actor) return SIGNED_OUT
  if (!actor.roles?.includes('admin')) return { ok: false, message: 'Only an administrator can do that.' }

  const found = await engine.find({ collection: 'users', where: { email: { equals: String(email ?? '').trim().toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true })
  const target = found.docs[0] as { id: number } | undefined
  if (!target) return { ok: false, message: 'No account has that email address.' }
  try {
    return await adminRevokeAllForAccount(deps, actor, target.id)
  } catch {
    return { ok: false, message: 'That could not be done just now. Try again.' }
  }
}
