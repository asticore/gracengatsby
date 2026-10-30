import { headers } from 'next/headers'

import { getAdminContext } from '@/admin/auth'
import { resolveD1Binding } from '@/cms/db/connect'
import { resolveAccess, type Action } from '@/features/roles/permissions'
import type { D1Like } from '@/features/apiKeys'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings, type SecuritySettings } from '@/features/security/settings'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { createD1WebhookStore, type WebhookStore } from './store'

/**
 * The webhooks builder's session gate, shared by the server actions and the docs download route.
 * Signed in, an admin or the `webhooks` permission for the action, and not impersonating a customer.
 * Kept out of actions.ts because a 'use server' file may only export server actions.
 */

export type WebhookGate =
  | { ok: true; userId: number; email: string; store: WebhookStore; settings: SecuritySettings; engine: unknown; origin: { ip?: string | null; userAgent?: string | null } }
  | { ok: false; error: string }

const ACTIONS: Record<'read' | 'create' | 'update' | 'delete', Action> = { read: 'read', create: 'create', update: 'update', delete: 'delete' }

export async function gate(action: keyof typeof ACTIONS): Promise<WebhookGate> {
  const requestHeaders = await headers()
  const blocked = refuseWhileImpersonating(requestHeaders)
  if (blocked) return { ok: false, error: blocked }
  const context = await getAdminContext()
  const user = context.user as { id?: number; email?: string } | null
  if (!user || typeof user.id !== 'number') return { ok: false, error: 'Sign in to use the webhooks builder.' }
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'webhooks', ACTIONS[action]) === 'all'
  if (!allowed) return { ok: false, error: 'You do not have permission to use the webhooks builder.' }
  const settings = await getSecuritySettings(context.engine as never)
  const seen = auditContext(new Request('https://engage.local', { headers: requestHeaders }))
  // Only the address and the browser go in the log, never the cookie.
  const origin = { ip: seen.ip, userAgent: seen.userAgent }
  const store = createD1WebhookStore(async () => (await resolveD1Binding()) as unknown as D1Like)
  return { ok: true, userId: user.id, email: String(user.email ?? ''), store, settings, engine: context.engine, origin }
}

/** Writes one line to the security audit log. A log line never fails the action. */
export async function auditWebhook(g: Extract<WebhookGate, { ok: true }>, action: 'create' | 'update' | 'delete', documentId: number | null, detail: string): Promise<void> {
  try {
    await audit({ action, actorId: g.userId, actorEmail: g.email, collectionSlug: 'webhooks', documentId, detail: detail.slice(0, 200), ip: g.origin.ip, userAgent: g.origin.userAgent } as never, g.settings)
  } catch {
    // A log line never fails the save.
  }
}
