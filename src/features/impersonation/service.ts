import type { ImpersonationSettings } from '@/features/security/settings'

import { clampMinutes, normaliseReason, preflight, REFUSAL_MESSAGES, sessionSecondsFor, targetProblem, type Refusal } from './policy'

/**
 * Start, stop and history for admin impersonation, with every side effect
 * passed in. The server actions supply the real store, engine and audit log;
 * the integration tests supply in-memory doubles. The order of checks here is
 * the order the refusals are reported in.
 */

export type ImpersonationRow = {
  id: string
  adminId: number
  adminEmail: string
  targetUserId: number
  targetEmail: string
  reason: string
  startedAt: string
  endedAt: string | null
  expiresAt: string
  sessionId: string | null
  ip: string | null
  userAgent: string | null
}

export type ImpersonationStore = {
  insert: (row: ImpersonationRow) => Promise<void>
  findByID: (id: string) => Promise<ImpersonationRow | null>
  setSession: (id: string, sessionId: string) => Promise<void>
  /** Sets ended_at, only where it is still null. Returns whether a row changed. */
  end: (id: string, at: string) => Promise<boolean>
  /** Newest first. */
  list: (limit: number) => Promise<ImpersonationRow[]>
}

export type TargetAccount = { id: number; email: string; roles: unknown; locked: boolean }

export type ImpersonationAudit = {
  action: 'impersonation.started' | 'impersonation.ended' | 'impersonation.refused'
  adminId: number | null
  adminEmail: string | null
  targetUserId: number | null
  detail: string
  ip: string | null
  userAgent: string | null
}

export type SessionOrder = { ttlSeconds: number; claims: { imp: { adminId: number; impId: string } }; label: string }

export type ImpersonationDeps = {
  settings: ImpersonationSettings
  store: ImpersonationStore
  now: () => number
  newId: () => string
  /** The ordinary session length this site uses, in seconds. Impersonation never exceeds it. */
  ordinarySessionSeconds: number
  findAccountByEmail: (email: string) => Promise<TargetAccount | null>
  adminHasSecondFactor: (adminId: number) => Promise<boolean>
  /** Password or authenticator code, checked now. Never leaves a session behind. */
  verifyReauth: (adminId: number, proof: { password?: string; code?: string }) => Promise<boolean>
  /** Signs the target in with the given session order. `twoFactorRequired` means the customer has two-step on, and nothing was signed in. */
  signInAs: (target: TargetAccount, order: SessionOrder) => Promise<{ token: string } | { twoFactorRequired: true }>
  /** Ends one device session of a user. */
  revokeSession: (userId: number, sessionId: string) => Promise<void>
  audit: (entry: ImpersonationAudit) => Promise<void>
}

export type Admin = { id: number; email: string; roles: unknown }

export type StartInput = {
  targetEmail: unknown
  reason: unknown
  password?: string
  code?: string
  /** True when the request already carries an impersonation cookie. */
  alreadyImpersonating: boolean
  ip: string | null
  userAgent: string | null
}

export type StartResult =
  | { ok: true; token: string; impersonationId: string; expiresAt: string; maxMinutes: number; targetEmail: string }
  | { ok: false; refusal: Refusal; message: string }

const refuse = async (deps: ImpersonationDeps, admin: Admin | null, input: { ip: string | null; userAgent: string | null }, refusal: Refusal, target: string): Promise<StartResult> => {
  await deps.audit({
    action: 'impersonation.refused',
    adminId: admin?.id ?? null,
    adminEmail: admin?.email ?? null,
    targetUserId: null,
    detail: `refused: ${refusal}${target ? `; target ${target}` : ''}`,
    ip: input.ip,
    userAgent: input.userAgent,
  })
  return { ok: false, refusal, message: REFUSAL_MESSAGES[refusal] }
}

/** Starts an impersonated session. Every refusal is audited, and no step after a refusal has a side effect. */
export async function startImpersonation(deps: ImpersonationDeps, admin: Admin | null, input: StartInput): Promise<StartResult> {
  const address = { ip: input.ip, userAgent: input.userAgent }
  const typedEmail = typeof input.targetEmail === 'string' ? input.targetEmail.trim().toLowerCase() : ''

  const early = preflight({ settings: deps.settings, adminRoles: admin?.roles ?? null, alreadyImpersonating: input.alreadyImpersonating, reason: input.reason })
  if (early) return refuse(deps, admin, address, early, '')
  if (!admin) return refuse(deps, null, address, 'not_admin', '')
  const reason = normaliseReason(input.reason)
  if (!reason.ok) return refuse(deps, admin, address, 'reason', '')

  const target = typedEmail ? await deps.findAccountByEmail(typedEmail) : null
  const problem = targetProblem({ adminId: admin.id, target })
  if (problem) return refuse(deps, admin, address, problem, typedEmail)
  // Narrowed: targetProblem returns a refusal only when the target is missing.
  const customer = target as TargetAccount

  if (deps.settings.requireTwoFactor && !(await deps.adminHasSecondFactor(admin.id))) {
    return refuse(deps, admin, address, 'second_factor_required', customer.email)
  }
  if (!(await deps.verifyReauth(admin.id, { password: input.password, code: input.code }))) {
    return refuse(deps, admin, address, 'reauth_failed', customer.email)
  }

  const now = deps.now()
  const maxMinutes = clampMinutes(deps.settings.maxMinutes)
  const ttlSeconds = sessionSecondsFor(maxMinutes, deps.ordinarySessionSeconds)
  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString()
  const impersonationId = deps.newId()

  await deps.store.insert({
    id: impersonationId,
    adminId: admin.id,
    adminEmail: admin.email,
    targetUserId: customer.id,
    targetEmail: customer.email,
    reason: reason.value,
    startedAt: new Date(now).toISOString(),
    endedAt: null,
    expiresAt,
    sessionId: null,
    ip: input.ip,
    userAgent: input.userAgent,
  })

  const endUnstarted = async (): Promise<void> => {
    await deps.store.end(impersonationId, new Date(deps.now()).toISOString())
  }

  let signed: Awaited<ReturnType<ImpersonationDeps['signInAs']>>
  try {
    signed = await deps.signInAs(customer, {
      ttlSeconds,
      claims: { imp: { adminId: admin.id, impId: impersonationId } },
      label: `Impersonated by ${admin.email}`,
    })
  } catch {
    await endUnstarted()
    return refuse(deps, admin, address, 'start_failed', customer.email)
  }

  if ('twoFactorRequired' in signed) {
    await endUnstarted()
    return refuse(deps, admin, address, 'customer_two_step', customer.email)
  }

  const sessionId = sessionIdOf(signed.token)
  if (sessionId) await deps.store.setSession(impersonationId, sessionId)

  await deps.audit({
    action: 'impersonation.started',
    adminId: admin.id,
    adminEmail: admin.email,
    targetUserId: customer.id,
    detail: `started impersonating ${customer.email} for ${maxMinutes} min; reason: ${reason.value}; id ${impersonationId}`,
    ip: input.ip,
    userAgent: input.userAgent,
  })

  return { ok: true, token: signed.token, impersonationId, expiresAt, maxMinutes, targetEmail: customer.email }
}

/** Reads the `usid` claim of a token we just minted. Only ever applied to a token the engine returned, never to one from a request. */
const sessionIdOf = (token: string): string | null => {
  try {
    const segment = token.split('.')[1]
    if (!segment) return null
    const claims = JSON.parse(Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as { usid?: unknown }
    return typeof claims.usid === 'string' && claims.usid ? claims.usid : null
  } catch {
    return null
  }
}

export type StopResult = { ok: boolean; message: string; ended: boolean }

/**
 * Ends an impersonation: sets ended_at and revokes the impersonated device
 * session. Idempotent. The admin's own session is never touched, so stopping
 * restores the admin simply by the impersonation cookie going away.
 */
export async function stopImpersonation(deps: ImpersonationDeps, impersonationId: string | null, meta: { ip: string | null; userAgent: string | null }): Promise<StopResult> {
  if (!impersonationId) return { ok: true, message: 'You are not signed in as a customer.', ended: false }
  const row = await deps.store.findByID(impersonationId)
  if (!row) return { ok: true, message: 'You are not signed in as a customer.', ended: false }
  const at = new Date(deps.now()).toISOString()
  const changed = await deps.store.end(impersonationId, at)
  if (row.sessionId) await deps.revokeSession(row.targetUserId, row.sessionId)
  if (changed) {
    await deps.audit({
      action: 'impersonation.ended',
      adminId: row.adminId,
      adminEmail: row.adminEmail,
      targetUserId: row.targetUserId,
      detail: `stopped impersonating ${row.targetEmail}; id ${row.id}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  }
  return { ok: true, message: 'You are back to your own account.', ended: changed }
}

export type HistoryStatus = 'active' | 'ended' | 'expired'
export type HistoryEntry = Omit<ImpersonationRow, 'sessionId' | 'ip' | 'userAgent'> & { status: HistoryStatus }

/** The history screen's data: every impersonation, newest first, with a status computed from ended_at and expires_at. */
export async function impersonationHistory(store: ImpersonationStore, now: number, limit = 200): Promise<HistoryEntry[]> {
  const rows = await store.list(limit)
  return rows.map((row) => {
    const { sessionId: _s, ip: _i, userAgent: _u, ...shown } = row
    const status: HistoryStatus = row.endedAt ? 'ended' : Date.parse(row.expiresAt) > now ? 'active' : 'expired'
    return { ...shown, status }
  })
}

/** The impersonation id a verified or read impersonation token carries. */
export const impersonationIdFromClaims = (claims: Record<string, unknown> | null | undefined): string | null => {
  const imp = claims?.imp as { impId?: unknown } | undefined
  return typeof imp?.impId === 'string' && imp.impId ? imp.impId : null
}
