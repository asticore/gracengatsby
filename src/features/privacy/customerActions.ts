'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import type { Engine } from '@/engine'
import { accountContext, currentSessionToken, siteOrigin, type AccountUser } from '@/features/accounts/session'
import { requireCustomer } from '@/features/accounts/guards'
import { verifyPassword } from '@/features/accounts/auth'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings } from '@/features/security/settings'
import { listSessions, sessionIdFromToken } from '@/features/security/userSessions'
import { defaultUserSessionStore } from '@/features/security/userSessionStore'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { sessionIsFresh } from './core'
import { privacyBinding } from './binding'
import { openDeletionRequest } from './service'

/**
 * The customer's own deletion request. Signed in (requireCustomer), not impersonating, and the
 * password checked unless the session is fresh. Nothing is deleted here: the request waits for the
 * emailed link, then for an admin.
 */

const SCREEN = '/account/privacy'

export async function requestDeletionAction(formData: FormData): Promise<void> {
  if (refuseWhileImpersonating(await headers())) redirect(`${SCREEN}?deletion=impersonating`)
  const { engine, user } = await requireCustomer(SCREEN)
  const userId = Number(user.id)
  const email = String(user.email ?? '')

  const { store } = await privacyBinding()
  if (await store.openForUser(userId)) redirect(`${SCREEN}?deletion=open`)

  // A session signed in within the last 15 minutes needs no password. Otherwise the password must match.
  const usid = sessionIdFromToken(await currentSessionToken())
  const sessions = await listSessions(defaultUserSessionStore, userId).catch((): never[] => [])
  const current = sessions.find((s) => s.id === usid)
  const fresh = sessionIsFresh(current?.createdAt, Date.now())
  if (!fresh) {
    const password = String(formData.get('password') ?? '')
    if (!password || !(await verifyPassword(engine as never, email, password))) redirect(`${SCREEN}?deletion=password`)
  }

  const result = await openDeletionRequest({ store, userId, email, siteOrigin: await siteOrigin(), now: new Date() })
  if (result.ok === false) redirect(`${SCREEN}?deletion=open`)
  try {
    const settings = await getSecuritySettings(engine as never)
    const seen = auditContext(new Request('https://engage.local', { headers: await headers() }))
    await audit({ action: 'privacy.request', actorId: userId, actorEmail: email, collectionSlug: 'privacy-requests', documentId: result.value?.id ?? null, detail: 'deletion requested by customer', ip: seen.ip, userAgent: seen.userAgent } as never, settings)
  } catch {
    // A log line never fails the request.
  }
  redirect(`${SCREEN}?deletion=sent`)
}

/** Used by the export route: the signed-in customer, or null. Refused while impersonating. */
export async function currentCustomerForExport(): Promise<{ blocked: boolean; user: AccountUser | null; engine: Engine | null }> {
  if (refuseWhileImpersonating(await headers())) return { blocked: true as const, user: null, engine: null }
  const context = await accountContext()
  if (!context.flags.accounts) return { blocked: true as const, user: null, engine: null }
  return { blocked: false as const, user: context.user, engine: context.engine }
}
