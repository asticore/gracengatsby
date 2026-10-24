import type { AuditAction } from './auditLog'
import { listSessions, revokeAll, revokeOtherSessions, revokeSession, type UserSessionRow, type UserSessionStore } from './userSessions'

/**
 * What the session screens do, with everything outside the decision passed in.
 *
 * The 'use server' wrappers in userSessionActions.ts supply the real store,
 * the audit log and the rate limiter; tests supply fakes. Nothing here reads a
 * request, so an id can only come from the caller - and the callers only ever
 * pass the signed-in user's own id, except the admin functions, which check the
 * role first.
 */

export type SessionActor = { id: number; email: string; roles?: string[] | null }

export type SessionDeps = {
  store: UserSessionStore
  /** Writes an audit entry. Must not throw; failures are the implementation's to swallow. */
  record: (action: AuditAction, actor: SessionActor, detail: string) => Promise<void>
  /** True when this actor has used up their revoke budget. */
  limited: (actor: SessionActor) => boolean
  /** Email for an account id, for audit text. May return null. */
  emailFor?: (userId: number) => Promise<string | null>
  now?: () => number
}

export type SessionOutcome = { ok: boolean; message: string }

export type SessionView = {
  id: string
  device: string
  ip: string | null
  createdAt: string
  lastSeenAt: string | null
  current: boolean
}

const SLOW_DOWN: SessionOutcome = { ok: false, message: 'Too many attempts. Wait a minute and try again.' }
const NOT_FOUND: SessionOutcome = { ok: false, message: 'That session is already ended or could not be found.' }
const ADMIN_ONLY: SessionOutcome = { ok: false, message: 'Only an administrator can do that.' }

export const isAdminActor = (actor: SessionActor): boolean => Boolean(actor.roles?.includes('admin'))

export const toSessionView = (row: UserSessionRow, currentId: string | null): SessionView => ({
  id: row.id,
  device: row.deviceLabel || 'Unknown device',
  ip: row.ip,
  createdAt: row.createdAt,
  lastSeenAt: row.lastSeenAt,
  current: currentId !== null && row.id === currentId,
})

export async function viewOwnSessions(deps: SessionDeps, actor: SessionActor, currentId: string | null): Promise<SessionView[]> {
  const rows = await listSessions(deps.store, actor.id, deps.now?.())
  return rows.map((row) => toSessionView(row, currentId))
}

/** Ends one of the actor's own sessions. The one they are using is refused: signing out is the way to end that. */
export async function revokeOwnSession(deps: SessionDeps, actor: SessionActor, currentId: string | null, targetId: string): Promise<SessionOutcome> {
  if (deps.limited(actor)) return SLOW_DOWN
  if (currentId && targetId === currentId) return { ok: false, message: 'That is the device you are using. Sign out to end it.' }

  const done = await revokeSession(deps.store, actor.id, targetId, deps.now?.())
  if (!done) return NOT_FOUND

  await deps.record('session.revoked', actor, `session: ${targetId}`)
  return { ok: true, message: 'That device has been signed out.' }
}

/** Ends every other session of the actor, keeping the one making the request. */
export async function revokeOwnOtherSessions(deps: SessionDeps, actor: SessionActor, currentId: string | null): Promise<SessionOutcome> {
  if (deps.limited(actor)) return SLOW_DOWN

  const count = await revokeOtherSessions(deps.store, actor.id, currentId, deps.now?.())
  await deps.record('session.revoked-others', actor, `sessions ended: ${count}`)
  return { ok: true, message: count === 0 ? 'There were no other devices signed in.' : `Signed out ${count} other device${count === 1 ? '' : 's'}.` }
}

/** Admin: the active sessions of another account. */
export async function viewAccountSessions(deps: SessionDeps, actor: SessionActor, targetUserId: number): Promise<SessionView[] | null> {
  if (!isAdminActor(actor)) return null
  const rows = await listSessions(deps.store, targetUserId, deps.now?.())
  return rows.map((row) => toSessionView(row, null))
}

/** Admin: ends one session of any account. Audited with the account it belonged to. */
export async function adminRevokeSession(deps: SessionDeps, actor: SessionActor, targetId: string): Promise<SessionOutcome> {
  if (!isAdminActor(actor)) return ADMIN_ONLY
  if (deps.limited(actor)) return SLOW_DOWN

  const row = await deps.store.findByID(targetId)
  if (!row) return NOT_FOUND
  const done = await revokeSession(deps.store, row.userId, row.id, deps.now?.())
  if (!done) return NOT_FOUND

  const email = deps.emailFor ? await deps.emailFor(row.userId).catch((): null => null) : null
  await deps.record('session.admin-revoked', actor, `account: ${email ?? row.userId}; session: ${row.id}`)
  return { ok: true, message: 'That device has been signed out.' }
}

/** Admin: ends every session of another account. */
export async function adminRevokeAllForAccount(deps: SessionDeps, actor: SessionActor, targetUserId: number): Promise<SessionOutcome> {
  if (!isAdminActor(actor)) return ADMIN_ONLY
  if (deps.limited(actor)) return SLOW_DOWN

  const count = await revokeAll(deps.store, targetUserId, deps.now?.())
  const email = deps.emailFor ? await deps.emailFor(targetUserId).catch((): null => null) : null
  await deps.record('session.admin-revoked', actor, `account: ${email ?? targetUserId}; all sessions (${count})`)
  return { ok: true, message: count === 0 ? 'That account had no active sessions.' : `Signed out ${count} session${count === 1 ? '' : 's'}.` }
}
