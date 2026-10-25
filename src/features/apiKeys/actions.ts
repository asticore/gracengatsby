'use server'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { headers } from 'next/headers'

import { reauthenticate } from '@/features/accounts/passkeysWiring'
import { resolveD1Binding } from '@/cms/db/connect'
import { audit, auditContext } from '@/features/security/auditLog'
import { hit } from '@/features/security/rateLimit'
import { getSecuritySettings, type SecuritySettings } from '@/features/security/settings'
import { getEngine } from '@/lib/engine'

import { createD1ApiKeyStore, createApiKey, isActive, listApiKeys, revokeApiKey, type ApiKeyDeps, type ApiKeyRow, type D1Like, type LiveOwner } from './index'
import { isStaffRoles, scopableCollections, type ScopeCollection } from './core'

/**
 * What the API key screens call. The signed-in person is always the cookie session's own:
 * `engine.auth` is called without the `apiKeys` option, so a bearer key in the request
 * resolves to no user here and every action refuses. Creating a key re-checks the password
 * or the two-step code, like passkey registration. Only the key's hash is stored; the full
 * key is returned once, to the caller that created it.
 */

export type ApiKeyView = {
  id: number
  userId: number
  ownerEmail: string | null
  name: string
  prefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  active: boolean
}

export type ApiKeyActionResult = { ok: boolean; error?: string; key?: string; keys?: ApiKeyView[] }

type Actor = { id: number; email: string; roles: string[]; isAdmin: boolean }

const CREATES_PER_HOUR = 10

async function session(): Promise<{ actor: Actor; settings: SecuritySettings; deps: ApiKeyDeps; engineUser: unknown } | null> {
  const engine = await getEngine()
  const incoming = await headers()
  const { user } = await engine.auth({ headers: incoming }).catch((): { user: null } => ({ user: null }))
  if (!user) return null
  const doc = user as unknown as { id: number; email: string; roles?: string[] }
  const settings = await getSecuritySettings(engine as never)
  const origin = auditContext(new Request('https://engage.local', { headers: incoming }))
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
        | { id: number; email: string; roles?: string[] }
        | null
      if (!row) return null
      return { id: row.id, email: row.email, roles: row.roles ?? [], locked: false, user: row }
    },
  }
  const roles = doc.roles ?? []
  const actor: Actor = { id: Number(doc.id), email: String(doc.email ?? ''), roles, isAdmin: roles.includes('admin') }
  return { actor, settings, deps, engineUser: user }
}

async function emailsFor(userIds: number[]): Promise<Map<number, string>> {
  const engine = await getEngine()
  const out = new Map<number, string>()
  for (const id of [...new Set(userIds)]) {
    const row = (await engine.findByID({ collection: 'users', id, depth: 0, overrideAccess: true }).catch((): null => null)) as { email?: string } | null
    if (row?.email) out.set(id, row.email)
  }
  return out
}

const toViews = async (rows: ApiKeyRow[], now: number): Promise<ApiKeyView[]> => {
  const emails = await emailsFor(rows.map((r) => r.userId))
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    ownerEmail: emails.get(row.userId) ?? null,
    name: row.name,
    prefix: row.prefix,
    scopes: [...row.scopes],
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    active: isActive(row, now),
  }))
}

const myKeys = async (s: NonNullable<Awaited<ReturnType<typeof session>>>): Promise<ApiKeyView[]> =>
  toViews(await listApiKeys(s.deps.store, { userId: s.actor.id }), s.deps.now())

/** The signed-in person's own keys. */
export async function listMyApiKeys(): Promise<ApiKeyActionResult> {
  const s = await session()
  if (!s) return { ok: false, error: 'Sign in to see your API keys.' }
  return { ok: true, keys: await myKeys(s) }
}

/** Every key on the site, for an admin. Anyone else is refused. */
export async function listAllApiKeys(): Promise<ApiKeyActionResult> {
  const s = await session()
  if (!s) return { ok: false, error: 'Sign in to see API keys.' }
  if (!s.actor.isAdmin) return { ok: false, error: 'Only admins can see every key.' }
  return { ok: true, keys: await toViews(await listApiKeys(s.deps.store, 'all'), s.deps.now()) }
}

export async function createMyApiKey(input: { name: string; scopes: string[]; expiresInDays?: string; password?: string; code?: string }): Promise<ApiKeyActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, error: blocked }

  const s = await session()
  if (!s) return { ok: false, error: 'Sign in to create an API key.' }
  if (!s.settings.apiKeys.enabled) return { ok: false, error: 'API keys are not turned on for this site.' }
  if (!isStaffRoles(s.actor.roles) && !s.settings.apiKeys.allowCustomers) {
    return { ok: false, error: 'API keys are not available to customers on this site.' }
  }
  if (!(await reauthenticate(s.actor.id, { password: input.password, code: input.code }))) {
    return { ok: false, error: 'Enter your current password or a two-step code to create a key.' }
  }
  if (hit(`api-keys:create:${s.actor.id}`, CREATES_PER_HOUR).limited) {
    return { ok: false, error: 'Too many keys created recently. Try again in a little while.' }
  }
  const owner: LiveOwner = { id: s.actor.id, email: s.actor.email, roles: s.actor.roles, locked: false, user: s.engineUser }
  const expiresInDays = input.expiresInDays && input.expiresInDays.trim() !== '' ? Number(input.expiresInDays) : undefined
  const created = await createApiKey(s.deps, owner, { name: input.name, scopes: input.scopes, expiresInDays }, s.settings.apiKeys, { id: s.actor.id, email: s.actor.email })
  if (created.ok === false) return { ok: false, error: created.error }
  return { ok: true, key: created.value.key, keys: await myKeys(s) }
}

/** Revokes one key. The owner may revoke their own; an admin may revoke any (audited). */
export async function revokeApiKeyAction(keyId: number): Promise<ApiKeyActionResult> {  const blocked = refuseWhileImpersonating(await headers())
  if (blocked) return { ok: false, error: blocked }

  const s = await session()
  if (!s) return { ok: false, error: 'Sign in to revoke a key.' }
  const result = await revokeApiKey(s.deps, { id: s.actor.id, email: s.actor.email, isAdmin: s.actor.isAdmin }, Number(keyId))
  if (result.ok === false) return { ok: false, error: result.error }
  const keys = s.actor.isAdmin ? await toViews(await listApiKeys(s.deps.store, 'all'), s.deps.now()) : await myKeys(s)
  return { ok: true, keys }
}

/** The collections the scope picker offers, from the live config. Empty when nobody is signed in. */
export async function apiKeyScopeChoicesAction(): Promise<ScopeCollection[]> {
  const s = await session()
  if (!s) return []
  const engine = await getEngine()
  return scopableCollections(engine.config.collections as unknown as Array<{ slug?: unknown; labels?: { plural?: unknown } | null }>)
}
