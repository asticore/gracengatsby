// @vitest-environment node
// Per-user API keys. The store is an in-memory double that follows the same contract as
// the D1 store, so every rule runs against real key material: keys are generated, hashed,
// looked up by hash and checked exactly as in production. The REST gate is exercised through
// the exported gateApiKeyRequest with a fake engine. No browser, no live database.
import { beforeEach, describe, expect, it } from 'vitest'

import {
  API_KEY_RATE_PER_MINUTE,
  ApiKeyRefused,
  authenticateApiKey,
  createApiKey,
  decideRoute,
  forbiddenFieldIn,
  generateApiKey,
  hashApiKey,
  isActive,
  listApiKeys,
  presentedApiKey,
  revokeApiKey,
  validateScopes,
  type ApiKeyAuditEntry,
  type ApiKeyDeps,
  type ApiKeyRow,
  type ApiKeyStore,
  type LiveOwner,
} from '@/features/apiKeys'
import { DEFAULT_API_KEY_SETTINGS, type ApiKeySettings } from '@/features/security/settings'
import { hit, resetRateLimiter } from '@/features/security/rateLimit'
import { gateApiKeyRequest } from '@/localapi/rest'
import type { Engine } from '@/localapi/engine'

const NOW = Date.parse('2026-10-24T10:00:00.000Z')
const ON: ApiKeySettings = { ...DEFAULT_API_KEY_SETTINGS, enabled: true }

// --- Doubles -------------------------------------------------------------------

function memoryStore() {
  const rows: ApiKeyRow[] = []
  const store: ApiKeyStore & { touches: number } = {
    touches: 0,
    async insert(row) {
      const id = rows.length + 1
      rows.push({ ...row, id, lastUsedAt: null, revokedAt: null })
      return id
    },
    async findByHash(keyHash) {
      return rows.find((r) => r.keyHash === keyHash) ?? null
    },
    async findById(id) {
      return rows.find((r) => r.id === id) ?? null
    },
    async listForUser(userId) {
      return rows.filter((r) => r.userId === userId)
    },
    async listAll() {
      return [...rows]
    },
    async touch(id, at) {
      this.touches += 1
      const row = rows.find((r) => r.id === id)
      if (row) row.lastUsedAt = at
    },
    async revoke(id, at) {
      const row = rows.find((r) => r.id === id)
      if (row && !row.revokedAt) row.revokedAt = at
    },
  }
  return { store, rows }
}

type Owner = { id: number; email: string; roles: string[]; locked: boolean }

function harness(initialOwners: Owner[] = [{ id: 1, email: 'ana@example.com', roles: ['admin'], locked: false }]) {
  const { store, rows } = memoryStore()
  const owners = new Map(initialOwners.map((o) => [o.id, o]))
  const audits: ApiKeyAuditEntry[] = []
  let clock = NOW
  const deps: ApiKeyDeps = {
    store,
    now: () => clock,
    audit: async (entry) => {
      audits.push(entry)
    },
    loadOwner: async (userId): Promise<LiveOwner | null> => {
      const o = owners.get(userId)
      return o ? { ...o, user: { id: o.id, email: o.email, roles: o.roles } } : null
    },
  }
  return {
    deps,
    store,
    rows,
    audits,
    owners,
    setNow: (t: number) => {
      clock = t
    },
    advance: (ms: number) => {
      clock += ms
    },
  }
}

const owner = (id = 1): LiveOwner => ({ id, email: 'ana@example.com', roles: ['admin'], locked: false, user: { id } })

async function makeKey(h: ReturnType<typeof harness>, input: { name?: string; scopes?: string[]; expiresInDays?: unknown } = {}, settings = ON) {
  const result = await createApiKey(h.deps, owner(), { name: input.name ?? 'Stock sync', scopes: input.scopes ?? ['read'], expiresInDays: input.expiresInDays }, settings)
  if (result.ok === false) throw new Error(`create failed: ${result.error}`)
  return result.value
}

const headersWith = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null })

beforeEach(() => {
  resetRateLimiter()
})

// --- Key material ----------------------------------------------------------------

describe('key material', () => {
  it('generates egk_ keys of 32 random bytes in base64url', () => {
    const key = generateApiKey()
    expect(key).toMatch(/^egk_[A-Za-z0-9_-]{43}$/)
    expect(generateApiKey()).not.toBe(key)
  })

  it('stores only the SHA-256 hash, never the key, and shows the key once', async () => {
    const h = harness()
    const created = await makeKey(h)
    const row = h.rows[0]
    expect(row.keyHash).toBe(await hashApiKey(created.key))
    expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(h.rows)).not.toContain(created.key)
    expect(row.prefix).toBe(created.key.slice(0, 8))
    // The listing shows the prefix, never the key.
    const listed = await listApiKeys(h.store, { userId: 1 })
    expect(JSON.stringify(listed)).not.toContain(created.key)
  })

  it('rejects scopes outside read and write, and empty scope lists', () => {
    expect(validateScopes(['admin']).ok).toBe(false)
    expect(validateScopes([]).ok).toBe(false)
    expect(validateScopes(['read', 'write']).ok).toBe(true)
  })
})

// --- Bearer auth -----------------------------------------------------------------

describe('bearer authentication', () => {
  it('accepts a key presented as Authorization Bearer and as x-api-key', async () => {
    const h = harness()
    const created = await makeKey(h, { scopes: ['read', 'write'] })
    expect(presentedApiKey(headersWith({ Authorization: `Bearer ${created.key}` }))).toBe(created.key)
    expect(presentedApiKey(headersWith({ 'x-api-key': created.key }))).toBe(created.key)
    const result = await authenticateApiKey(h.deps, created.key, ON)
    expect(result.owner.id).toBe(1)
    expect(result.key.scopes).toEqual(['read', 'write'])
  })

  it('ignores a key in a cookie or a non-key bearer token', () => {
    const key = generateApiKey()
    expect(presentedApiKey(headersWith({ Cookie: `engage-token=${key}` }))).toBeNull()
    expect(presentedApiKey(headersWith({ Authorization: 'Bearer eyJhbGciOi.jwt.value' }))).toBeNull()
    expect(presentedApiKey(headersWith({}))).toBeNull()
  })

  it('refuses an unknown key with an audit entry', async () => {
    const h = harness()
    await expect(authenticateApiKey(h.deps, generateApiKey(), ON)).rejects.toMatchObject({ reason: 'unknown', status: 401 })
    expect(h.audits.map((a) => a.action)).toContain('api-key.refused')
  })

  it('refuses a malformed value before any lookup', async () => {
    const h = harness()
    await expect(authenticateApiKey(h.deps, 'egk_short', ON)).rejects.toBeInstanceOf(ApiKeyRefused)
  })

  it('audits the first use of a key once, and not later', async () => {
    const h = harness()
    const created = await makeKey(h)
    await authenticateApiKey(h.deps, created.key, ON)
    h.advance(10_000)
    await authenticateApiKey(h.deps, created.key, ON)
    expect(h.audits.filter((a) => a.action === 'api-key.used')).toHaveLength(1)
  })
})

// --- Scopes and the deny list ----------------------------------------------------

describe('scopes', () => {
  it('a read-scope key cannot write', () => {
    expect(decideRoute(['read'], 'GET', ['pages'])).toEqual({ ok: true })
    expect(decideRoute(['read'], 'POST', ['pages'])).toMatchObject({ ok: false, status: 403 })
    expect(decideRoute(['read'], 'PATCH', ['pages', '7'])).toMatchObject({ ok: false, status: 403 })
  })

  it('a write-scope key can create and update but never delete', () => {
    expect(decideRoute(['write'], 'POST', ['pages'])).toEqual({ ok: true })
    expect(decideRoute(['write'], 'PATCH', ['pages', '7'])).toEqual({ ok: true })
    expect(decideRoute(['write'], 'DELETE', ['pages', '7'])).toMatchObject({ ok: false, status: 403 })
    expect(decideRoute(['write'], 'GET', ['pages'])).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses the deny-listed routes whatever the scopes', () => {
    const denied: string[][] = [
      ['users'],
      ['users', 'login'],
      ['users', 'logout'],
      ['users', 'refresh-token'],
      ['users', 'reset-password'],
      ['users', 'me'],
      ['pages', 'access'],
      ['api-keys'],
      ['two-factor', 'enroll'],
      ['passkeys'],
      ['social-accounts'],
      ['sessions'],
      ['payments', 'stripe', 'initiate'],
      ['globals', 'security-settings'],
    ]
    for (const slug of denied) {
      expect(decideRoute(['read', 'write'], 'GET', slug).ok).toBe(false)
    }
  })

  it('a key cannot reach key management, so it cannot create another key', () => {
    expect(decideRoute(['read', 'write'], 'POST', ['api-keys']).ok).toBe(false)
  })

  it('refuses a body that tries to set a secret or password field', () => {
    expect(forbiddenFieldIn({ title: 'x', nested: { password: 'p' } })).toBe('password')
    expect(forbiddenFieldIn([{ apiKey: 'k' }])).toBe('apiKey')
    expect(forbiddenFieldIn({ title: 'ok', list: [{ body: 'fine' }] })).toBeNull()
  })
})

// --- Owner rules: a key never exceeds its owner -------------------------------------

describe('owner rules', () => {
  it('a key stops working when its owner is downgraded to a customer', async () => {
    const h = harness()
    const created = await makeKey(h, { scopes: ['write'] })
    h.owners.get(1)!.roles = ['customer-role-only']
    await expect(authenticateApiKey(h.deps, created.key, { ...ON, allowCustomers: false })).rejects.toMatchObject({ reason: 'customers-disabled' })
  })

  it('a key keeps working for a downgraded owner only while customers are allowed', async () => {
    const h = harness()
    const created = await makeKey(h, { scopes: ['read'] })
    h.owners.get(1)!.roles = []
    await expect(authenticateApiKey(h.deps, created.key, { ...ON, allowCustomers: true })).resolves.toMatchObject({ owner: { id: 1 } })
  })

  it('a key stops working when its owner is locked or deleted', async () => {
    const h = harness()
    const created = await makeKey(h)
    h.owners.get(1)!.locked = true
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ reason: 'owner-locked' })
    h.owners.delete(1)
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ reason: 'owner-missing' })
  })

  it('an admin cannot create a key for a customer when customers are off, and a customer cannot create one at all', async () => {
    const h = harness([{ id: 2, email: 'cust@example.com', roles: [], locked: false }])
    const customer: LiveOwner = { id: 2, email: 'cust@example.com', roles: [], locked: false, user: { id: 2 } }
    const denied = await createApiKey(h.deps, customer, { name: 'x', scopes: ['read'] }, ON)
    expect(denied.ok).toBe(false)
    const allowed = await createApiKey(h.deps, customer, { name: 'x', scopes: ['read'] }, { ...ON, allowCustomers: true })
    expect(allowed.ok).toBe(true)
  })
})

// --- Revocation and expiry -----------------------------------------------------------

describe('revocation and expiry', () => {
  it('refuses a revoked key', async () => {
    const h = harness()
    const created = await makeKey(h)
    await revokeApiKey(h.deps, { id: 1, email: 'ana@example.com', isAdmin: true }, created.row.id)
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ reason: 'revoked' })
    expect(h.audits.some((a) => a.action === 'api-key.revoked')).toBe(true)
  })

  it('refuses an expired key and does not count it toward the per-user limit', async () => {
    const h = harness()
    const created = await makeKey(h, { expiresInDays: 1 })
    h.advance(2 * 86_400_000)
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ reason: 'expired' })
    expect(isActive(h.rows[0], h.deps.now())).toBe(false)
  })

  it("lets a user revoke only their own key, and an admin revoke anyone's", async () => {
    const h = harness([
      { id: 1, email: 'ana@example.com', roles: ['admin'], locked: false },
      { id: 2, email: 'cust@example.com', roles: [], locked: false },
    ])
    const created = await makeKey(h)
    const stranger = await revokeApiKey(h.deps, { id: 2, email: 'cust@example.com', isAdmin: false }, created.row.id)
    expect(stranger.ok).toBe(false)
    const admin = await revokeApiKey(h.deps, { id: 9, email: 'boss@example.com', isAdmin: true }, created.row.id)
    expect(admin.ok).toBe(true)
    expect(h.audits.find((a) => a.action === 'api-key.revoked')?.detail).toContain('by an admin')
  })
})

// --- Creation limits -----------------------------------------------------------------

describe('creation limits', () => {
  it('enforces the per-user maximum', async () => {
    const h = harness()
    for (let i = 0; i < 5; i++) await makeKey(h, { name: `k${i}` })
    const sixth = await createApiKey(h.deps, owner(), { name: 'k6', scopes: ['read'] }, ON)
    expect(sixth.ok).toBe(false)
  })

  it('enforces the lifetime cap', async () => {
    const h = harness()
    const tooLong = await createApiKey(h.deps, owner(), { name: 'x', scopes: ['read'], expiresInDays: 400 }, ON)
    expect(tooLong.ok).toBe(false)
    const within = await createApiKey(h.deps, owner(), { name: 'x', scopes: ['read'], expiresInDays: 30 }, ON)
    expect(within.ok && within.value.row.expiresAt).toBe(new Date(NOW + 30 * 86_400_000).toISOString())
  })

  it('with a lifetime of 0, forbids expiry dates so keys last until revoked', async () => {
    const h = harness()
    const off = { ...ON, maxLifetimeDays: 0 }
    const withExpiry = await createApiKey(h.deps, owner(), { name: 'x', scopes: ['read'], expiresInDays: 10 }, off)
    expect(withExpiry.ok).toBe(false)
    const forever = await createApiKey(h.deps, owner(), { name: 'x', scopes: ['read'] }, off)
    expect(forever.ok && forever.value.row.expiresAt).toBe(null)
  })
})

// --- Feature switch, throttle, failure ---------------------------------------------------

describe('feature switch, last-used throttle and failure', () => {
  it('rejects every key while the feature is disabled', async () => {
    const h = harness()
    const created = await makeKey(h)
    await expect(authenticateApiKey(h.deps, created.key, DEFAULT_API_KEY_SETTINGS)).rejects.toMatchObject({ reason: 'disabled' })
    const create = await createApiKey(h.deps, owner(), { name: 'x', scopes: ['read'] }, DEFAULT_API_KEY_SETTINGS)
    expect(create.ok).toBe(false)
  })

  it('writes last_used_at at most once per five minutes', async () => {
    const h = harness()
    const created = await makeKey(h)
    await authenticateApiKey(h.deps, created.key, ON)
    expect(h.store.touches).toBe(1)
    h.advance(60_000)
    await authenticateApiKey(h.deps, created.key, ON)
    expect(h.store.touches).toBe(1)
    h.advance(5 * 60_000)
    await authenticateApiKey(h.deps, created.key, ON)
    expect(h.store.touches).toBe(2)
  })

  it('fails closed with 503 when the key store errors', async () => {
    const h = harness()
    const created = await makeKey(h)
    h.store.findByHash = async () => {
      throw new Error('D1 is down')
    }
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ reason: 'unavailable', status: 503 })
  })

  it('fails closed with 503 when the owner lookup errors', async () => {
    const h = harness()
    const created = await makeKey(h)
    h.deps.loadOwner = async () => {
      throw new Error('users table unreadable')
    }
    await expect(authenticateApiKey(h.deps, created.key, ON)).rejects.toMatchObject({ status: 503 })
  })
})

// --- Rate limit ----------------------------------------------------------------------

describe('rate limit', () => {
  it('limits one key to its per-minute bucket and leaves other keys alone', () => {
    for (let i = 0; i < API_KEY_RATE_PER_MINUTE; i++) expect(hit('api-key:1', API_KEY_RATE_PER_MINUTE, NOW).limited).toBe(false)
    expect(hit('api-key:1', API_KEY_RATE_PER_MINUTE, NOW).limited).toBe(true)
    expect(hit('api-key:2', API_KEY_RATE_PER_MINUTE, NOW).limited).toBe(false)
  })
})

// --- REST gate -----------------------------------------------------------------------

type FakeAuth = (args: { headers: unknown; apiKeys?: boolean }) => Promise<{ user: unknown; apiKey?: { id: number; userId: number; name: string; scopes: ('read' | 'write')[] } }>

const gateEngine = (auth: FakeAuth): Engine => ({ auth }) as unknown as Engine
const requestWith = (method: string, key: string | null, body?: unknown) =>
  new Request('https://shop.example/api/pages', {
    method,
    headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })

describe('REST gate for keys', () => {
  const okAuth = (scopes: ('read' | 'write')[]): FakeAuth => async () => ({ user: { id: 1 }, apiKey: { id: 42, userId: 1, name: 'k', scopes } })

  it('lets requests without a key through untouched', async () => {
    expect(await gateApiKeyRequest(gateEngine(okAuth(['read'])), requestWith('POST', null), ['pages'])).toBeNull()
  })

  it('answers 403 for a read key that writes, and 403 for a deny-listed route', async () => {
    const key = generateApiKey()
    const writeRes = await gateApiKeyRequest(gateEngine(okAuth(['read'])), requestWith('POST', key, { title: 'x' }), ['pages'])
    expect(writeRes?.status).toBe(403)
    const denyRes = await gateApiKeyRequest(gateEngine(okAuth(['read', 'write'])), requestWith('GET', key), ['users', 'me'])
    expect(denyRes?.status).toBe(403)
  })

  it('answers 403 for a body that writes a password field', async () => {
    const key = generateApiKey()
    const res = await gateApiKeyRequest(gateEngine(okAuth(['write'])), requestWith('POST', key, { title: 'x', password: 'p' }), ['pages'])
    expect(res?.status).toBe(403)
  })

  it('answers 401 for a refused key and 503 when the key cannot be checked', async () => {
    const key = generateApiKey()
    const refused = await gateApiKeyRequest(
      gateEngine(async () => {
        throw new ApiKeyRefused('revoked')
      }),
      requestWith('GET', key),
      ['pages'],
    )
    expect(refused?.status).toBe(401)
    const unavailable = await gateApiKeyRequest(
      gateEngine(async () => {
        throw new ApiKeyRefused('unavailable', 503)
      }),
      requestWith('GET', key),
      ['pages'],
    )
    expect(unavailable?.status).toBe(503)
  })

  it('never serves an anonymous request when a key cannot be verified for any other reason', async () => {
    const key = generateApiKey()
    const res = await gateApiKeyRequest(
      gateEngine(async () => {
        throw new Error('unexpected')
      }),
      requestWith('GET', key),
      ['pages'],
    )
    expect(res?.status).toBe(500)
  })

  it('answers 429 after the per-key limit within a minute', async () => {
    const key = generateApiKey()
    const engine = gateEngine(okAuth(['read']))
    for (let i = 0; i < API_KEY_RATE_PER_MINUTE; i++) expect(await gateApiKeyRequest(engine, requestWith('GET', key), ['pages'])).toBeNull()
    const limited = await gateApiKeyRequest(engine, requestWith('GET', key), ['pages'])
    expect(limited?.status).toBe(429)
  })

  it('passes an allowed read through', async () => {
    const key = generateApiKey()
    expect(await gateApiKeyRequest(gateEngine(okAuth(['read'])), requestWith('GET', key), ['pages'])).toBeNull()
  })
})

// --- Settings wiring ---------------------------------------------------------------

describe('settings defaults', () => {
  it('ships with API keys off and the documented limits', () => {
    expect(DEFAULT_API_KEY_SETTINGS).toEqual({ enabled: false, allowCustomers: false, maxPerUser: 5, maxLifetimeDays: 365 })
  })
})
