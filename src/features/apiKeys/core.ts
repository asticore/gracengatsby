import { randomBytes, sha256, toBase64Url, utf8 } from '@/features/passkeys/encoding'

/**
 * Per-user API keys: the pure rules. No database, no request object beyond a
 * `get(name)` headers shape, so every rule here is unit-testable on its own.
 *
 * Key format: `egk_` followed by 32 random bytes in base64url (43 characters).
 * Only the SHA-256 of the whole key is stored (hex). The full key is shown once,
 * at creation; the 8-character prefix is kept for display only.
 */

export const KEY_PREFIX = 'egk_'
export const DISPLAY_PREFIX_LENGTH = 8
export const SCOPES = ['read', 'write'] as const
export type ApiKeyScope = (typeof SCOPES)[number]

/** Requests per minute allowed for one key, counted in the `api-key` rate-limit bucket. */
export const API_KEY_RATE_PER_MINUTE = 120
/** A key's `last_used_at` is written at most this often. */
export const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000

const KEY_SHAPE = /^egk_[A-Za-z0-9_-]{43}$/

export type HeadersLike = { get: (name: string) => string | null | undefined }

/** A new key, as `egk_...`. The caller must show it once and never store it. */
export function generateApiKey(): string {
  return KEY_PREFIX + toBase64Url(randomBytes(32))
}

/** Lower-case hex SHA-256 of the whole key. This is what `eg_api_keys.key_hash` holds. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await sha256(utf8(key))
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export const displayPrefix = (key: string): string => key.slice(0, DISPLAY_PREFIX_LENGTH)

export const isApiKeyShape = (token: string): boolean => KEY_SHAPE.test(token)

/**
 * The key a request presents, from HEADERS ONLY. `Authorization: Bearer egk_...`
 * or `x-api-key: egk_...`. A key in the query string or a cookie is never read
 * here, so it is ignored by construction. Returns null when no key-shaped value
 * is present, so an ordinary JWT bearer or cookie goes down the old path.
 */
export function presentedApiKey(headers: HeadersLike): string | null {
  const authorization = headers.get('Authorization')
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.slice(7).trim()
    return token.startsWith(KEY_PREFIX) ? token : null
  }
  const header = headers.get('x-api-key')?.trim()
  return header && header.startsWith(KEY_PREFIX) ? header : null
}

export function parseScopes(raw: string | readonly string[] | null | undefined): ApiKeyScope[] {
  let list: unknown = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  return SCOPES.filter((scope) => list.includes(scope))
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function validateName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') return { ok: false, error: 'Give the key a name.' }
  const trimmed = name.trim()
  if (trimmed.length === 0) return { ok: false, error: 'Give the key a name.' }
  if (trimmed.length > 80) return { ok: false, error: 'The name must be 80 characters or fewer.' }
  return { ok: true, value: trimmed }
}

export function validateScopes(input: unknown): ValidationResult<ApiKeyScope[]> {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: 'Choose at least one scope.' }
  const picked = SCOPES.filter((scope) => input.includes(scope))
  if (picked.length !== new Set(input).size) return { ok: false, error: 'Unknown scope. Choose read or write.' }
  return { ok: true, value: picked }
}

/**
 * The expiry rule. `maxLifetimeDays` 0 means keys cannot carry an expiry at all:
 * a key then has no `expires_at` and lasts until revoked. Otherwise a key must
 * expire, after `days` days (default: the maximum), and `days` must be 1..max.
 */
export function resolveExpiry(now: number, days: unknown, maxLifetimeDays: number): ValidationResult<string | null> {
  if (maxLifetimeDays === 0) {
    if (days === undefined || days === null || days === 0 || days === '') return { ok: true, value: null }
    return { ok: false, error: 'This site does not allow API keys to expire. Leave the expiry empty.' }
  }
  const chosen = days === undefined || days === null || days === '' ? maxLifetimeDays : Number(days)
  if (!Number.isInteger(chosen) || chosen < 1 || chosen > maxLifetimeDays) {
    return { ok: false, error: `Choose an expiry between 1 and ${maxLifetimeDays} days.` }
  }
  return { ok: true, value: new Date(now + chosen * 86_400_000).toISOString() }
}

/** Method and route rules for a key, applied on top of the owner's own permissions. */
export type RouteDecision = { ok: true } | { ok: false; status: 403; message: string }

/** Collections no key may touch at all. */
const DENIED_COLLECTIONS = new Set(['users', 'api-keys', 'api_keys'])

/**
 * Any path segment matching this is refused, wherever it sits. Covers the auth
 * endpoints (login, logout, refresh, password, unlock), the second-factor,
 * passkey, social, session and key-management routes, and payments.
 */
const DENIED_SEGMENT =
  /^(login|login-2fa|logout|refresh-token|forgot-password|reset-password|unlock|me|access|password|passwords|two-factor|2fa|passkeys?|social|social-accounts|sessions?|user-sessions|api-keys|api_keys|secrets?|payments)$/i

/**
 * Field names a key may never write. A write whose body carries one of these
 * anywhere (at any depth) is refused, so a key cannot set a password, a hash,
 * a token or a secret through a content collection.
 */
const FORBIDDEN_FIELD = /password|secret|salt|hash|token|two.?factor|api.?key|passkey/i

/**
 * Decides whether a key with `scopes` may make this request. `method` is the
 * HTTP method and `slug` the REST path after `/api/`, already split.
 */
export function decideRoute(scopes: readonly ApiKeyScope[], method: string, slug: readonly string[]): RouteDecision {
  const deny = (message: string): RouteDecision => ({ ok: false, status: 403, message })
  const verb = method.toUpperCase()
  if (slug.length === 0) return deny('API keys cannot use this route.')
  if (slug[0] === 'globals') return deny('API keys cannot read or change site settings.')
  if (DENIED_COLLECTIONS.has(slug[0])) return deny('API keys cannot use this collection.')
  if (slug.some((segment) => DENIED_SEGMENT.test(segment))) return deny('API keys cannot use this route.')
  if (verb === 'GET' || verb === 'HEAD') {
    return scopes.includes('read') ? { ok: true } : deny('This API key does not have the read scope.')
  }
  if (verb === 'POST' || verb === 'PATCH') {
    return scopes.includes('write') ? { ok: true } : deny('This API key does not have the write scope.')
  }
  if (verb === 'DELETE') return deny('API keys cannot delete. Deletion is not a key scope.')
  return deny('API keys cannot use this method.')
}

/** The first field name in a parsed body that a key may not write, or null. */
export function forbiddenFieldIn(value: unknown, depth = 0): string | null {
  if (depth > 12 || value === null || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = forbiddenFieldIn(item, depth + 1)
      if (found) return found
    }
    return null
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD.test(key)) return key
    const found = forbiddenFieldIn(child, depth + 1)
    if (found) return found
  }
  return null
}

/** Whether a stored `last_used_at` is old enough that a new use should write it. */
export function shouldWriteLastUsed(lastUsedAt: string | null, now: number): boolean {
  if (!lastUsedAt) return true
  const last = Date.parse(lastUsedAt)
  if (!Number.isFinite(last)) return true
  return now - last >= LAST_USED_WRITE_INTERVAL_MS
}

/** Staff roles, as the admin panel defines them (src/admin/auth.ts). Everyone else is a customer. */
export const isStaffRoles = (roles: readonly string[] | null | undefined): boolean =>
  Boolean(roles?.some((role) => role === 'admin' || role === 'editor' || role === 'viewer'))
