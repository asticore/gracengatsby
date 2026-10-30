import { headers } from 'next/headers'

import { getAdminContext } from '@/admin/auth'
import { resolveD1Binding } from '@/cms/db/connect'
import { resolveAccess, type Action } from '@/features/roles/permissions'
import { createD1ApiKeyStore, type ApiKeyDeps, type D1Like, type LiveOwner } from '@/features/apiKeys'
import { audit, auditContext } from '@/features/security/auditLog'
import { getSecuritySettings, type SecuritySettings } from '@/features/security/settings'
import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { createD1EndpointStore, type EndpointStore } from './store'

/**
 * The API builder's session gate, shared by the server actions and the developer guide route.
 * Signed in, an admin or the `api` permission for the action, and not impersonating a customer.
 * Kept out of actions.ts because a 'use server' file may only export server actions.
 */

export type Gate =
  | { ok: true; userId: number; email: string; store: EndpointStore; settings: SecuritySettings; deps: ApiKeyDeps; owner: LiveOwner; engine: unknown }
  | { ok: false; error: string }

const ACTION_TO_PERMISSION: Record<'read' | 'create' | 'update' | 'delete', Action> = { read: 'read', create: 'create', update: 'update', delete: 'delete' }



export async function gate(action: keyof typeof ACTION_TO_PERMISSION): Promise<Gate> {
  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, error: blocked }
  const context = await getAdminContext()
  const user = context.user as { id?: number; email?: string; roles?: string[] } | null
  if (!user || typeof user.id !== 'number') return { ok: false, error: 'Sign in to use the API builder.' }
  const allowed = context.isAdmin || resolveAccess(context.user as never, 'api', ACTION_TO_PERMISSION[action]) === 'all'
  if (!allowed) return { ok: false, error: 'You do not have permission to use the API builder.' }
  const engine = context.engine as unknown as { findByID: (a: unknown) => Promise<unknown> }
  const settings = await getSecuritySettings(context.engine as never)
  const origin = auditContext(new Request('https://engage.local', { headers: await headers() }))
  const deps: ApiKeyDeps = {
    store: createD1ApiKeyStore(async () => (await resolveD1Binding()) as unknown as D1Like),
    now: () => Date.now(),
    audit: async (entry) => {
      try {
        await audit({ ...entry, collectionSlug: 'api-keys', ...origin }, settings)
      } catch {
        // A log line never fails the action.
      }
    },
    loadOwner: async (userId) => {
      const row = (await engine.findByID({ collection: 'users', id: userId, depth: 0, overrideAccess: true }).catch((): null => null)) as
        | { id: number; email: string; roles?: string[]; lockUntil?: string | null }
        | null
      if (!row) return null
      return { id: row.id, email: row.email, roles: row.roles ?? [], locked: Boolean(row.lockUntil && Date.parse(row.lockUntil) > Date.now()), user: row }
    },
  }
  const store = createD1EndpointStore(async () => (await resolveD1Binding()) as unknown as D1Like)
  const owner: LiveOwner = { id: user.id, email: String(user.email ?? ''), roles: user.roles ?? [], locked: false, user }
  return { ok: true, userId: user.id, email: String(user.email ?? ''), store, settings, deps, owner, engine: context.engine }
}

