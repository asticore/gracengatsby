'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { findUserAuthRowByID } from '@/cms/db/collections/users'
import { getEngine } from '@/lib/engine'
import { audit, auditContext } from '@/features/security/auditLog'
import { defaultPasskeyStore } from '@/features/passkeys'
import { defaultTwoFactorStore } from '@/features/security/twoFactorStore'
import { isEnrolled, verifySecondFactor } from '@/features/security/twoFactor'
import { getSecuritySettings, type ImpersonationSettings } from '@/features/security/settings'
import { defaultUserSessionStore } from '@/features/security/userSessionStore'

import { defaultImpersonationStore } from './store'
import { IMPERSONATION_COOKIE, headersForCustomerView, isImpersonating, REFUSAL_MESSAGES, unverifiedClaims, type Refusal } from './policy'
import { impersonationHistory, startImpersonation, stopImpersonation, type HistoryEntry, type ImpersonationDeps, type TargetAccount } from './service'

/**
 * What the admin screen and the customer banner call. The admin is always the
 * session's own (engage-token), never an argument. The customer is found by
 * email for the start, and is otherwise the one the impersonation cookie names.
 *
 * Server-only. Nothing here is reachable from a REST route.
 */

export type StartActionResult = { ok: boolean; message: string; refusal?: Refusal; redirectTo?: string }

const USERS = 'users'

async function buildDeps(engine: Awaited<ReturnType<typeof getEngine>>, settings: ImpersonationSettings, meta: { ip: string | null; userAgent: string | null }): Promise<ImpersonationDeps> {
  const full = await getSecuritySettings(engine as never)
  return {
    settings,
    store: defaultImpersonationStore,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    ordinarySessionSeconds: 7200,
    findAccountByEmail: async (email): Promise<TargetAccount | null> => {
      const found = await engine.find({ collection: USERS, where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      const doc = found.docs[0] as { id: number; email: string; roles?: unknown } | undefined
      if (!doc) return null
      const row = await findUserAuthRowByID(Number(doc.id)).catch((): null => null)
      const locked = Boolean(row?.lockUntil && Date.parse(row.lockUntil) > Date.now())
      return { id: Number(doc.id), email: doc.email, roles: doc.roles ?? [], locked }
    },
    adminHasSecondFactor: async (adminId) => {
      const row = await defaultTwoFactorStore.findByID(adminId).catch((): null => null)
      if (row && isEnrolled(row)) return true
      const passkeys = await defaultPasskeyStore.listForUser(adminId).catch((): [] => [])
      return passkeys.length > 0
    },
    verifyReauth: async (adminId, proof) => {
      const row = await defaultTwoFactorStore.findByID(adminId).catch((): null => null)
      if (!row) return false
      if (proof.password && defaultTwoFactorStore.checkPassword?.(row, proof.password)) return true
      if (proof.code && isEnrolled(row)) {
        const result = await verifySecondFactor(defaultTwoFactorStore, { id: adminId }, proof.code).catch(() => ({ ok: false }))
        return Boolean(result.ok)
      }
      return false
    },
    signInAs: async (target, order) => {
      const result = await engine.loginAsUser({
        collection: USERS,
        id: target.id,
        client: { userAgent: meta.userAgent, ip: meta.ip },
        session: order,
      })
      if (result.twoFactorRequired) return { twoFactorRequired: true }
      if (!result.token) throw new Error('no token')
      return { token: result.token }
    },
    revokeSession: async (userId, sessionId) => {
      await defaultUserSessionStore.revoke(sessionId, userId, new Date().toISOString())
    },
    audit: async (entry) => {
      await audit(
        {
          action: entry.action,
          actorId: entry.adminId,
          actorEmail: entry.adminEmail,
          collectionSlug: USERS,
          documentId: entry.targetUserId,
          detail: entry.detail,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
        full,
      )
    },
  }
}

async function signedInAdmin() {
  const engine = await getEngine()
  const incoming = await headers()
  const { user } = await engine.auth({ headers: incoming }).catch((): { user: null } => ({ user: null }))
  const roles = (user as { roles?: unknown } | null)?.roles
  const isAdmin = Array.isArray(roles) && roles.includes('admin')
  return { engine, incoming, admin: user && isAdmin ? { id: Number((user as { id: unknown }).id), email: String((user as { email: unknown }).email), roles } : null }
}

const requestMeta = async (incoming: Awaited<ReturnType<typeof headers>>) => {
  const meta = auditContext(new Request('https://engage.local', { headers: incoming }))
  return { ip: meta.ip ?? null, userAgent: meta.userAgent ?? null }
}

/** Admin only: opens a customer's account for a short time. The reason and a fresh password or code are required. */
export async function startImpersonationAction(input: { email: string; reason: string; password?: string; code?: string }): Promise<StartActionResult> {
  try {
    const { engine, incoming, admin } = await signedInAdmin()
    const meta = await requestMeta(incoming)
    const settings = (await getSecuritySettings(engine as never)).impersonation
    const deps = await buildDeps(engine, settings, meta)
    const result = await startImpersonation(deps, admin, {
      targetEmail: input?.email,
      reason: input?.reason,
      password: typeof input?.password === 'string' ? input.password : undefined,
      code: typeof input?.code === 'string' ? input.code : undefined,
      alreadyImpersonating: isImpersonating(incoming),
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
    if (result.ok === false) return { ok: false, message: result.message, refusal: result.refusal }

    const remaining = Math.max(1, Math.round((Date.parse(result.expiresAt) - Date.now()) / 1000))
    const jar = await cookies()
    jar.set(IMPERSONATION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: remaining,
    })
    return { ok: true, message: `You are now viewing the site as ${result.targetEmail}.`, redirectTo: '/account' }
  } catch {
    return { ok: false, message: REFUSAL_MESSAGES.start_failed, refusal: 'start_failed' }
  }
}

/** Ends the impersonation: the impersonated session is revoked and the cookie cleared. The admin's own session is not touched. Always allowed. */
export async function stopImpersonationAction(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(IMPERSONATION_COOKIE)?.value ?? null
  jar.delete(IMPERSONATION_COOKIE)
  try {
    const engine = await getEngine()
    const incoming = await headers()
    const meta = await requestMeta(incoming)
    const impId = (() => {
      const claims = unverifiedClaims(token)
      const imp = claims?.imp as { impId?: unknown } | undefined
      return typeof imp?.impId === 'string' ? imp.impId : null
    })()
    const settings = (await getSecuritySettings(engine as never)).impersonation
    const deps = await buildDeps(engine, settings, meta)
    await stopImpersonation(deps, impId, meta)
  } catch {
    // The cookie is already cleared; a failed log line must not leave the customer view up.
  }
  redirect('/admin/security/impersonation')
}

/** Admin only: every impersonation, newest first. */
export async function impersonationHistoryAction(): Promise<{ ok: boolean; message?: string; entries: HistoryEntry[] }> {
  const { admin } = await signedInAdmin()
  if (!admin) return { ok: false, message: 'Only an administrator can see this.', entries: [] }
  try {
    return { ok: true, entries: await impersonationHistory(defaultImpersonationStore, Date.now()) }
  } catch {
    return { ok: false, message: 'The history could not be loaded just now.', entries: [] }
  }
}

/** Read by the customer banner: the email of the customer being viewed, or null when not impersonating. */
export async function impersonatedEmailAction(): Promise<string | null> {
  const incoming = await headers()
  if (!isImpersonating(incoming)) return null
  const engine = await getEngine()
  const { user } = await engine.auth({ headers: headersForCustomerView(incoming) }).catch((): { user: null } => ({ user: null }))
  return (user as { email?: string } | null)?.email ?? null
}
