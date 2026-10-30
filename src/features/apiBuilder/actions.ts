'use server'

import { collectionConfigs, globalConfigs } from '@/localapi/registry'
import { createApiKey, listApiKeys, revokeApiKey, isActive, type ApiKeyRow, type ApiKeyDeps } from '@/features/apiKeys'
import type { ApiKeyView } from '@/features/apiKeys/actions'
import { audit } from '@/features/security/auditLog'
import { SOURCE_COLLECTIONS } from '@/features/dataViews/catalogue'
import { collectionChoices, createEndpoint, deleteEndpoint, setEndpointEnabled, updateEndpoint, type CollectionChoice } from './admin'
import { RESERVED_ENDPOINT_WORDS, endpointPath, type ApiEndpoint, type ApiEndpointConfig } from './core'
import { gate, type Gate } from './gate'
import { type CallLogEntry } from './store'

/**
 * What the API builder screen calls. Every action first checks that the caller is signed in,
 * is an admin or holds the `api` permission for the action, and is not impersonating a customer.
 * Writes are audited to the security audit log with the endpoint's id, never its key or body.
 */

export type BuilderData = {
  endpoints: ApiEndpoint[]
  choices: CollectionChoice[]
  keys: ApiKeyView[]
  keysEnabled: boolean
  reserved: string[]
  canEdit: boolean
  publicDocs: { enabled: boolean; path: string | null }
}

export type BuilderResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string }

const reservedWords = (): string[] => {
  const names = new Set<string>([...RESERVED_ENDPOINT_WORDS])
  for (const c of collectionConfigs) if (typeof c.slug === 'string') names.add(c.slug)
  for (const g of globalConfigs) if (typeof g.slug === 'string') names.add(g.slug)
  return [...names].sort()
}

const reservedSet = (): ReadonlySet<string> => new Set(reservedWords())

const toKeyView = (row: ApiKeyRow, owners: Map<number, string>, now: number): ApiKeyView => ({
  id: row.id,
  userId: row.userId,
  ownerEmail: owners.get(row.userId) ?? null,
  name: row.name,
  prefix: row.prefix,
  scopes: [...row.scopes],
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  expiresAt: row.expiresAt,
  revokedAt: row.revokedAt,
  active: isActive(row, now),
})

async function keyViews(g: { deps: ApiKeyDeps }): Promise<{ keys: ApiKeyView[]; keyIds: Set<number> }> {
  const rows = await listApiKeys(g.deps.store, 'all')
  const owners = new Map<number, string>()
  for (const id of new Set(rows.map((r) => r.userId))) {
    const owner = await g.deps.loadOwner(id)
    if (owner) owners.set(id, owner.email)
  }
  const now = g.deps.now()
  const keys = rows.map((row) => toKeyView(row, owners, now))
  return { keys, keyIds: new Set(keys.filter((k) => !k.revokedAt).map((k) => k.id)) }
}

/** Everything the builder screen needs. */
export async function loadBuilderAction(): Promise<BuilderResult<BuilderData>> {
  const g = await gate('read')
  if (g.ok === false) return g
  const { keys } = await keyViews(g)
  const docs = await g.store.docsSettings()
  return {
    ok: true,
    value: {
      endpoints: await g.store.list(),
      choices: collectionChoices(SOURCE_COLLECTIONS),
      keys,
      keysEnabled: g.settings.apiKeys.enabled,
      reserved: reservedWords(),
      canEdit: true,
      publicDocs: { enabled: docs.docsPublic, path: docs.docsPublic ? `/api/x/docs/${docs.docsToken}` : null },
    },
  }
}

/** Creates or updates an endpoint from the form. `id` absent means create. */
export async function saveEndpointAction(id: number | null, input: unknown): Promise<BuilderResult<ApiEndpoint>> {
  const g = await gate(id === null ? 'create' : 'update')
  if (g.ok === false) return g
  const keyIds = (await keyViews(g)).keyIds
  const context = { reserved: reservedSet(), keyIds, sources: SOURCE_COLLECTIONS }
  const at = new Date().toISOString()
  const result = id === null ? await createEndpoint(g.store, input, context, at) : await updateEndpoint(g.store, id, input, context, at)
  if (result.ok === false) return { ok: false, error: result.error }
  await writeAudit(g, id === null ? 'create' : 'update', result.value.id, `${result.value.name}: ${endpointPath(result.value.version, result.value.slug)}`)
  return { ok: true, value: result.value }
}

export async function setEnabledAction(id: number, enabled: boolean): Promise<BuilderResult<ApiEndpoint>> {
  const g = await gate('update')
  if (g.ok === false) return g
  const result = await setEndpointEnabled(g.store, id, enabled, new Date().toISOString())
  if (result.ok === false) return { ok: false, error: result.error }
  await writeAudit(g, 'update', result.value.id, enabled ? 'enabled' : 'disabled')
  return { ok: true, value: result.value }
}

export async function deleteEndpointAction(id: number): Promise<BuilderResult> {
  const g = await gate('delete')
  if (g.ok === false) return g
  const existing = await g.store.findById(id)
  const result = await deleteEndpoint(g.store, id)
  if (result.ok === false) return { ok: false, error: result.error }
  if (existing) await writeAudit(g, 'delete', existing.id, `${existing.name}: ${endpointPath(existing.version, existing.slug)}`)
  return { ok: true }
}

/** The last calls to one endpoint, newest first. Who, when and the status only. */
export async function recentCallsAction(endpointId: number): Promise<BuilderResult<CallLogEntry[]>> {
  const g = await gate('read')
  if (g.ok === false) return g
  return { ok: true, value: await g.store.recentCalls(endpointId, 50) }
}

/**
 * One-time key for the Try it console: a key on the signed-in admin's own account, scoped to the
 * endpoint's collection, expiring in a day. The full key is returned once and never stored in clear.
 */
export async function createTryItKeyAction(endpointId: number): Promise<BuilderResult<{ key: string; keyId: number }>> {
  const g = await gate('read')
  if (g.ok === false) return g
  if (!g.settings.apiKeys.enabled) return { ok: false, error: 'API keys are not turned on for this site.' }
  const endpoint = await g.store.findById(endpointId)
  if (!endpoint) return { ok: false, error: 'That endpoint no longer exists.' }
  const scopes = [`${endpoint.collection}:read`]
  if (endpoint.allowCreate || endpoint.allowUpdate) scopes.push(`${endpoint.collection}:write`)
  const created = await createApiKey(g.deps, g.owner, { name: `Try it: ${endpoint.name}`.slice(0, 80), scopes, expiresInDays: 1 }, g.settings.apiKeys, { id: g.userId, email: g.email })
  if (created.ok === false) return { ok: false, error: created.error }
  return { ok: true, value: { key: created.value.key, keyId: created.value.row.id } }
}

/** Revokes a key the Try it console made, straight after the call. An admin can revoke any key. */
export async function revokeTryItKeyAction(keyId: number): Promise<BuilderResult> {
  const g = await gate('read')
  if (g.ok === false) return g
  const result = await revokeApiKey(g.deps, { id: g.userId, email: g.email, isAdmin: true }, keyId)
  return result.ok === false ? { ok: false, error: result.error } : { ok: true }
}

async function writeAudit(g: Extract<Gate, { ok: true }>, action: 'create' | 'update' | 'delete', documentId: number | null, detail: string): Promise<void> {
  try {
    await audit({ action, actorId: g.userId, actorEmail: g.email, collectionSlug: 'api-endpoints', documentId, detail: detail.slice(0, 200) }, g.settings)
  } catch {
    // A log line never fails the save.
  }
}

export type { ApiEndpointConfig }

const publicPath = (token: string): string => `/api/x/docs/${token}`

/** Switches the public developer guide link on or off. Off by default. */
export async function setPublicDocsAction(enabled: boolean): Promise<BuilderResult<{ path: string | null }>> {
  const g = await gate('update')
  if (g.ok === false) return g
  await g.store.setDocsPublic(enabled, new Date().toISOString())
  const docs = await g.store.docsSettings()
  await writeAudit(g, 'update', null, enabled ? 'developer guide: public link on' : 'developer guide: public link off')
  return { ok: true, value: { path: docs.docsPublic ? publicPath(docs.docsToken) : null } }
}

/** Makes a new public guide link. The old link stops working at once. */
export async function regenerateDocsTokenAction(): Promise<BuilderResult<{ path: string }>> {
  const g = await gate('update')
  if (g.ok === false) return g
  const token = await g.store.regenerateDocsToken(new Date().toISOString())
  await writeAudit(g, 'update', null, 'developer guide: public link regenerated')
  return { ok: true, value: { path: publicPath(token) } }
}
