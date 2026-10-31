import { headers } from 'next/headers'

import { getAdminContext } from '@/admin/auth'
import { resolveD1Binding } from '@/cms/db/connect'
import type { D1Like } from '@/features/apiKeys'
import { resolveAccess, type Action } from '@/features/roles/permissions'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings, type SecuritySettings } from '@/features/security/settings'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { createD1PrivacyStore, type PrivacyStore } from './store'

/**
 * The admin privacy screen's session gate, shared by its server actions. Signed in, an admin or the
 * `privacy` permission for the action, and not impersonating a customer. Kept out of actions.ts
 * because a 'use server' file may only export server actions.
 */

export type PrivacyGate =
  | { ok: true; userId: number; email: string; store: PrivacyStore; d1: D1Like; settings: SecuritySettings; engine: unknown; origin: { ip?: string | null; userAgent?: string | null } }
  | { ok: false; error: string }

export async function gate(action: Extract<Action, 'read' | 'update'>): Promise<PrivacyGate> {
  const requestHeaders = await headers()
  const blocked = refuseWhileImpersonating(requestHeaders)
  if (blocked) return { ok: false, error: blocked }
  const context = await getAdminContext()
  const user = context.user as { id?: number; email?: string } | null
  if (!user || typeof user.id !== 'number') return { ok: false, error: 'Sign in to view privacy requests.' }
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'privacy', action) === 'all'
  if (!allowed) return { ok: false, error: 'You do not have permission to handle privacy requests.' }
  const settings = await getSecuritySettings(context.engine as never)
  const seen = auditContext(new Request('https://engage.local', { headers: requestHeaders }))
  const origin = { ip: seen.ip, userAgent: seen.userAgent }
  const d1 = (await resolveD1Binding()) as unknown as D1Like
  return {
    ok: true,
    userId: user.id,
    email: String(user.email ?? ''),
    store: createD1PrivacyStore(async () => d1),
    d1,
    settings,
    engine: context.engine,
    origin,
  }
}

/** One audit line. The detail never holds personal data: an id and a status only. */
export async function auditPrivacy(
  g: Extract<PrivacyGate, { ok: true }>,
  action: 'privacy.decide' | 'privacy.erase',
  requestId: number,
  detail: string,
): Promise<void> {
  try {
    await audit({ action, actorId: g.userId, actorEmail: g.email, collectionSlug: 'privacy-requests', documentId: requestId, detail: detail.slice(0, 200), ip: g.origin.ip, userAgent: g.origin.userAgent } as never, g.settings)
  } catch {
    // A log line never fails the decision.
  }
}
