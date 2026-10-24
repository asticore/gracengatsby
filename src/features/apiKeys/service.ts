import type { ApiKeySettings } from '@/features/security/settings'

import {
  displayPrefix,
  generateApiKey,
  hashApiKey,
  isApiKeyShape,
  isStaffRoles,
  parseScopes,
  resolveExpiry,
  shouldWriteLastUsed,
  validateName,
  validateScopes,
  type ApiKeyScope,
  type ValidationResult,
} from './core'

/**
 * Per-user API keys: the flows (authenticate a presented key, create, list,
 * revoke). Every database and clock touch goes through `ApiKeyDeps`, so the
 * tests drive the real rules against an in-memory store, and the engine wires
 * the D1 store and the live user lookup in production.
 */

export type ApiKeyRow = {
  id: number
  userId: number
  name: string
  prefix: string
  keyHash: string
  scopes: ApiKeyScope[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

export type NewApiKeyRow = Omit<ApiKeyRow, 'id' | 'lastUsedAt' | 'revokedAt'>

export type ApiKeyStore = {
  insert(row: NewApiKeyRow): Promise<number>
  findByHash(keyHash: string): Promise<ApiKeyRow | null>
  findById(id: number): Promise<ApiKeyRow | null>
  listForUser(userId: number): Promise<ApiKeyRow[]>
  listAll(): Promise<ApiKeyRow[]>
  touch(id: number, at: string): Promise<void>
  revoke(id: number, at: string): Promise<void>
}

/** The owner as the live database sees them right now. Null when the account is gone. */
export type LiveOwner = {
  id: number
  email: string
  roles: string[]
  /** True while the account's lock is still in the future. */
  locked: boolean
  /** The auth user document the engine hands to access checks. Opaque here. */
  user: unknown
}

export type ApiKeyAuditAction = 'api-key.created' | 'api-key.revoked' | 'api-key.used' | 'api-key.refused'

export type ApiKeyAuditEntry = {
  action: ApiKeyAuditAction
  actorId?: number | null
  actorEmail?: string | null
  documentId?: number | null
  detail?: string | null
}

export type ApiKeyDeps = {
  store: ApiKeyStore
  loadOwner: (userId: number) => Promise<LiveOwner | null>
  audit: (entry: ApiKeyAuditEntry) => Promise<void>
  now: () => number
}

/** What a request learns about the key that authenticated it. */
export type ApiKeyContext = { id: number; userId: number; name: string; scopes: ApiKeyScope[] }

/**
 * Thrown when a presented key cannot be used. `unavailable` (503) means the key
 * could not be checked at all; the request is refused, never served anonymously.
 */
export class ApiKeyRefused extends Error {
  readonly status: 401 | 503
  readonly reason: string
  constructor(reason: string, status: 401 | 503 = 401) {
    super(status === 503 ? 'API key could not be verified. Try again.' : 'API key is not valid.')
    this.name = 'ApiKeyRefused'
    this.reason = reason
    this.status = status
  }
}

export type AuthenticatedKey = { owner: LiveOwner; key: ApiKeyContext }

/**
 * Checks a presented key end to end. Refusals throw `ApiKeyRefused` after an audit
 * entry. A store or owner-lookup failure also throws, as `unavailable`, so the
 * caller fails closed.
 */
export async function authenticateApiKey(deps: ApiKeyDeps, token: string, settings: ApiKeySettings): Promise<AuthenticatedKey> {
  const refuse = async (reason: string, detail?: string | null): Promise<never> => {
    await deps.audit({ action: 'api-key.refused', detail: `${reason}${detail ? `: ${detail}` : ''}` }).catch((): void => undefined)
    throw new ApiKeyRefused(reason)
  }
  if (!settings.enabled) return refuse('disabled')
  if (!isApiKeyShape(token)) return refuse('malformed')

  let row: ApiKeyRow | null
  let owner: LiveOwner | null
  try {
    row = await deps.store.findByHash(await hashApiKey(token))
  } catch {
    throw new ApiKeyRefused('unavailable', 503)
  }
  if (!row) return refuse('unknown')
  if (row.revokedAt) return refuse('revoked', `key ${row.id}`)
  const now = deps.now()
  if (row.expiresAt && Date.parse(row.expiresAt) <= now) return refuse('expired', `key ${row.id}`)

  try {
    owner = await deps.loadOwner(row.userId)
  } catch {
    throw new ApiKeyRefused('unavailable', 503)
  }
  if (!owner) return refuse('owner-missing', `key ${row.id}`)
  if (owner.locked) return refuse('owner-locked', `key ${row.id}`)
  if (!isStaffRoles(owner.roles) && !settings.allowCustomers) return refuse('customers-disabled', `key ${row.id}`)

  const scopes = parseScopes(row.scopes)
  if (row.lastUsedAt === null) {
    await deps.audit({ action: 'api-key.used', actorId: owner.id, actorEmail: owner.email, documentId: row.id, detail: 'first use' }).catch((): void => undefined)
  }
  if (shouldWriteLastUsed(row.lastUsedAt, now)) {
    try {
      await deps.store.touch(row.id, new Date(now).toISOString())
    } catch {
      // A missed last-used stamp is harmless; the request itself is still allowed.
    }
  }
  return { owner, key: { id: row.id, userId: row.userId, name: row.name, scopes } }
}

export type CreateApiKeyInput = {
  name: unknown
  scopes: unknown
  /** Days until expiry. Omitted means the site maximum. Ignored when expiry is not allowed. */
  expiresInDays?: unknown
}

export type CreatedApiKey = { key: string; row: ApiKeyRow }

/**
 * Creates a key for `owner`. The caller must already have checked that the request
 * came with a normal cookie session and that the owner is allowed to act. The full
 * key is returned here and nowhere else: only its hash is stored.
 */
export async function createApiKey(
  deps: ApiKeyDeps,
  owner: LiveOwner,
  input: CreateApiKeyInput,
  settings: ApiKeySettings,
  actor: { id: number; email: string } = { id: owner.id, email: owner.email },
): Promise<ValidationResult<CreatedApiKey>> {
  if (!settings.enabled) return { ok: false, error: 'API keys are not turned on for this site.' }
  if (!isStaffRoles(owner.roles) && !settings.allowCustomers) {
    return { ok: false, error: 'API keys are not available to customers on this site.' }
  }
  const name = validateName(input.name)
  if (name.ok === false) return { ok: false, error: name.error }
  const scopes = validateScopes(input.scopes)
  if (scopes.ok === false) return { ok: false, error: scopes.error }
  const now = deps.now()
  const expires = resolveExpiry(now, input.expiresInDays, settings.maxLifetimeDays)
  if (expires.ok === false) return { ok: false, error: expires.error }

  const active = (await deps.store.listForUser(owner.id)).filter((row) => isActive(row, now)).length
  if (active >= settings.maxPerUser) {
    return { ok: false, error: `You already have ${settings.maxPerUser} active API keys. Revoke one to create another.` }
  }

  const key = generateApiKey()
  const createdAt = new Date(now).toISOString()
  const draft: NewApiKeyRow = {
    userId: owner.id,
    name: name.value,
    prefix: displayPrefix(key),
    keyHash: await hashApiKey(key),
    scopes: scopes.value,
    createdAt,
    expiresAt: expires.value,
  }
  const id = await deps.store.insert(draft)
  await deps.audit({ action: 'api-key.created', actorId: actor.id, actorEmail: actor.email, documentId: id, detail: `${draft.scopes.join(',')}` }).catch((): void => undefined)
  return { ok: true, value: { key, row: { ...draft, id, lastUsedAt: null, revokedAt: null } } }
}

export const isActive = (row: ApiKeyRow, now: number): boolean =>
  !row.revokedAt && (!row.expiresAt || Date.parse(row.expiresAt) > now)

export type RevokeResult = { ok: true; row: ApiKeyRow } | { ok: false; error: string }

/**
 * Revokes one key. The owner may revoke their own; an admin may revoke anyone's.
 * An admin revoking another person's key is audited with that detail.
 */
export async function revokeApiKey(
  deps: ApiKeyDeps,
  actor: { id: number; email: string; isAdmin: boolean },
  keyId: number,
): Promise<RevokeResult> {
  const row = await deps.store.findById(keyId)
  if (!row) return { ok: false, error: 'No such key.' }
  if (row.userId !== actor.id && !actor.isAdmin) return { ok: false, error: 'No such key.' }
  if (row.revokedAt) return { ok: true, row }
  const at = new Date(deps.now()).toISOString()
  await deps.store.revoke(row.id, at)
  const byAdmin = row.userId !== actor.id
  await deps.audit({
    action: 'api-key.revoked',
    actorId: actor.id,
    actorEmail: actor.email,
    documentId: row.id,
    detail: byAdmin ? `revoked by an admin for user ${row.userId}` : 'revoked by owner',
  }).catch((): void => undefined)
  return { ok: true, row: { ...row, revokedAt: at } }
}

/** Keys for one owner, or every key for an admin view. Newest first. */
export async function listApiKeys(store: ApiKeyStore, scope: { userId: number } | 'all'): Promise<ApiKeyRow[]> {
  const rows = scope === 'all' ? await store.listAll() : await store.listForUser(scope.userId)
  return [...rows].sort((a, b) => b.id - a.id)
}

// --- D1 store ---------------------------------------------------------------

type D1Stmt = {
  bind: (...values: unknown[]) => {
    run: () => Promise<unknown>
    all: <T>() => Promise<{ results?: T[] }>
    first: <T>() => Promise<T | null>
  }
}
export type D1Like = { prepare: (query: string) => D1Stmt }

type Raw = {
  id: number
  user_id: number
  name: string
  prefix: string
  key_hash: string
  scopes: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

const TABLE = '`eg_api_keys`'

const toRow = (r: Raw): ApiKeyRow => ({
  id: Number(r.id),
  userId: Number(r.user_id),
  name: r.name,
  prefix: r.prefix,
  keyHash: r.key_hash,
  scopes: parseScopes(r.scopes),
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at ?? null,
  expiresAt: r.expires_at ?? null,
  revokedAt: r.revoked_at ?? null,
})

/** Bound statements against `eg_api_keys`. `getDb` resolves the binding per call. */
export function createD1ApiKeyStore(getDb: () => Promise<D1Like>): ApiKeyStore {
  return {
    async insert(row) {
      const db = await getDb()
      const result = (await db
        .prepare(`INSERT INTO ${TABLE} (user_id, name, prefix, key_hash, scopes, created_at, last_used_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)`)
        .bind(row.userId, row.name, row.prefix, row.keyHash, JSON.stringify(row.scopes), row.createdAt, row.expiresAt)
        .run()) as { meta?: { last_row_id?: number } }
      return Number(result.meta?.last_row_id ?? 0)
    },
    async findByHash(keyHash) {
      const db = await getDb()
      const raw = await db.prepare(`SELECT * FROM ${TABLE} WHERE key_hash = ? LIMIT 1`).bind(keyHash).first<Raw>()
      return raw ? toRow(raw) : null
    },
    async findById(id) {
      const db = await getDb()
      const raw = await db.prepare(`SELECT * FROM ${TABLE} WHERE id = ? LIMIT 1`).bind(id).first<Raw>()
      return raw ? toRow(raw) : null
    },
    async listForUser(userId) {
      const db = await getDb()
      const rows = await db.prepare(`SELECT * FROM ${TABLE} WHERE user_id = ? ORDER BY id ASC`).bind(userId).all<Raw>()
      return (rows.results ?? []).map(toRow)
    },
    async listAll() {
      const db = await getDb()
      const rows = await db.prepare(`SELECT * FROM ${TABLE} ORDER BY id ASC`).bind().all<Raw>()
      return (rows.results ?? []).map(toRow)
    },
    async touch(id, at) {
      const db = await getDb()
      await db.prepare(`UPDATE ${TABLE} SET last_used_at = ? WHERE id = ?`).bind(at, id).run()
    },
    async revoke(id, at) {
      const db = await getDb()
      await db.prepare(`UPDATE ${TABLE} SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`).bind(at, id).run()
    },
  }
}
