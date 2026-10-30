import { describe, expect, it, vi } from 'vitest'

import { decideEndpointAccess, parseEndpointRoute, serveCustomEndpoint, type EndpointEngine } from '@/features/apiBuilder/runtime'
import { createEndpoint, setEndpointEnabled, updateEndpoint } from '@/features/apiBuilder/admin'
import type { ApiEndpoint, ApiEndpointConfig } from '@/features/apiBuilder/core'
import type { EndpointStore, CallLogEntry } from '@/features/apiBuilder/store'
import { ApiKeyRefused } from '@/features/apiKeys'

const SOURCES = [
  { slug: 'products', label: 'Products', versioned: false, categoryField: null, readSort: '-createdAt', fields: [
    { key: 'title', label: 'Title', kind: 'text', origin: 'built-in', defaultFormat: 'auto', path: 'title' },
    { key: 'price', label: 'Price', kind: 'number', origin: 'built-in', defaultFormat: 'number', path: 'price' },
    { key: 'slug', label: 'Slug', kind: 'text', origin: 'built-in', defaultFormat: 'auto', path: 'slug' },
  ] },
] as never

const config = (over: Partial<ApiEndpointConfig> = {}): ApiEndpointConfig => ({
  name: 'Products', description: '', version: 'v1', slug: 'products', collection: 'products',
  fields: ['title', 'price'], filters: [{ field: 'title', operators: ['eq'] }], sortable: ['price'], defaultSort: null,
  defaultLimit: 20, maxLimit: 50, allowCreate: true, allowUpdate: true, requiredRole: 'any', allowedKeyIds: null,
  rateLimitPerMinute: 60, enabled: true, responseFormat: 'envelope', ...over,
})

function memoryStore(seed: ApiEndpoint[] = []) {
  const rows = new Map<number, ApiEndpoint>(seed.map((e) => [e.id, e]))
  let next = seed.length + 1
  const logs: CallLogEntry[] = []
  const store: EndpointStore = {
    list: async () => [...rows.values()],
    findByPath: async (v, s) => [...rows.values()].find((e) => e.version === v && e.slug === s) ?? null,
    findById: async (id) => rows.get(id) ?? null,
    insert: async (c, at) => { const id = next++; rows.set(id, { ...c, id, createdAt: at, updatedAt: at }); return id },
    update: async (id, c, at) => { const old = rows.get(id)!; rows.set(id, { ...c, id, createdAt: old.createdAt, updatedAt: at }) },
    remove: async (id) => { rows.delete(id) },
    count: async () => rows.size,
    logCall: async (e) => { logs.push(e) },
    pruneLog: async () => undefined,
  }
  return { store, rows, logs }
}

const endpoint = (over: Partial<ApiEndpointConfig> = {}): ApiEndpoint => ({ ...config(over), id: 1, createdAt: 'x', updatedAt: 'x' })

function fakeEngine(over: Partial<EndpointEngine> = {}, roles: string[] = ['viewer'], keyScopes: string[] = ['products:read', 'products:write']) {
  const calls: Array<{ op: string; args: Record<string, unknown> }> = []
  const engine: EndpointEngine = {
    auth: vi.fn(async () => ({ user: { id: 7, roles }, apiKey: { id: 5, userId: 7, name: 'k', scopes: keyScopes } })),
    find: vi.fn(async (args) => { calls.push({ op: 'find', args }); return { docs: [{ id: 1, title: 'Shoe', price: 9, passwordHash: 'nope' }], totalDocs: 1, page: 1, totalPages: 1, hasNextPage: false } }),
    findByID: vi.fn(async (args) => { calls.push({ op: 'findByID', args }); return args.id === 1 ? { id: 1, title: 'Shoe', price: 9, slug: 'shoe' } : null }),
    create: vi.fn(async (args) => { calls.push({ op: 'create', args }); return { id: 2, title: 'Hat', price: 3 } }),
    update: vi.fn(async (args) => { calls.push({ op: 'update', args }); return args.id === 1 ? { id: 1, title: 'New', price: 4 } : null }),
    ...over,
  }
  return { engine, calls }
}

const req = (path: string, init: RequestInit & { key?: string } = {}) => {
  const headers = new Headers(init.headers)
  if (init.key) headers.set('Authorization', `Bearer ${init.key}`)
  return new Request(`https://example.test${path}`, { ...init, headers })
}
const KEY = 'egk_' + 'a'.repeat(43)
const rateAllow = async () => ({ limited: false, retryAfterSeconds: 0 })

describe('API builder: route parsing', () => {
  it('reads list and single routes and rejects other shapes', () => {
    expect(parseEndpointRoute(['x', 'v1', 'products'])).toEqual({ version: 'v1', name: 'products', id: null })
    expect(parseEndpointRoute(['x', 'v1', 'products', '42'])).toEqual({ version: 'v1', name: 'products', id: 42 })
    expect(parseEndpointRoute(['x', 'v1', 'products', 'abc'])).toBeNull()
    expect(parseEndpointRoute(['pages', 'v1', 'x'])).toBeNull()
  })
})

describe('API builder: access decisions', () => {
  const ep = endpoint({ allowCreate: false, allowUpdate: false })
  it('reads need the read scope on the collection', () => {
    expect(decideEndpointAccess({ endpoint: ep, method: 'GET', keyId: 5, keyScopes: ['products:read'], roles: [] }).ok).toBe(true)
    expect(decideEndpointAccess({ endpoint: ep, method: 'GET', keyId: 5, keyScopes: ['orders:read'], roles: [] }).ok).toBe(false)
  })
  it('a wildcard scope covers the collection', () => {
    expect(decideEndpointAccess({ endpoint: ep, method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: [] }).ok).toBe(true)
  })
  it('POST and PATCH are refused unless opted in', () => {
    expect(decideEndpointAccess({ endpoint: ep, method: 'POST', keyId: 5, keyScopes: ['products:write'], roles: [] })).toMatchObject({ ok: false, status: 405 })
    const open = endpoint({ allowCreate: true, allowUpdate: true })
    expect(decideEndpointAccess({ endpoint: open, method: 'POST', keyId: 5, keyScopes: ['products:write'], roles: [] }).ok).toBe(true)
    expect(decideEndpointAccess({ endpoint: open, method: 'PATCH', keyId: 5, keyScopes: ['products:read'], roles: [] }).ok).toBe(false)
  })
  it('DELETE is never offered', () => {
    expect(decideEndpointAccess({ endpoint: endpoint({ allowCreate: true, allowUpdate: true }), method: 'DELETE', keyId: 5, keyScopes: ['*:*'], roles: ['admin'] }).ok).toBe(false)
  })
  it('a key not on the list is refused, and an empty list means any key', () => {
    const limited = endpoint({ allowedKeyIds: [9] })
    expect(decideEndpointAccess({ endpoint: limited, method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: [] }).ok).toBe(false)
    expect(decideEndpointAccess({ endpoint: endpoint({ allowedKeyIds: null }), method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: [] }).ok).toBe(true)
  })
  it('required role is enforced on the key owner', () => {
    const admin = endpoint({ requiredRole: 'admin' })
    expect(decideEndpointAccess({ endpoint: admin, method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: ['editor'] }).ok).toBe(false)
    expect(decideEndpointAccess({ endpoint: admin, method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: ['admin'] }).ok).toBe(true)
    const staff = endpoint({ requiredRole: 'staff' })
    expect(decideEndpointAccess({ endpoint: staff, method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: ['customer'] }).ok).toBe(false)
  })
  it('a disabled endpoint refuses everything', () => {
    expect(decideEndpointAccess({ endpoint: endpoint({ enabled: false }), method: 'GET', keyId: 5, keyScopes: ['*:read'], roles: [] }).ok).toBe(false)
  })
})

describe('API builder: runtime', () => {
  it('returns 404 for an unknown or disabled endpoint, without revealing which', async () => {
    const { store } = memoryStore([endpoint({ enabled: false })])
    const { engine } = fakeEngine()
    const res = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(res?.status).toBe(404)
    const missing = await serveCustomEndpoint(req('/api/x/v1/nope', { key: KEY }), ['x', 'v1', 'nope'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(missing?.status).toBe(404)
  })

  it('refuses without a key, and refuses a key the auth layer rejects', async () => {
    const { store } = memoryStore([endpoint()])
    const { engine } = fakeEngine()
    const none = await serveCustomEndpoint(req('/api/x/v1/products'), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(none?.status).toBe(401)
    const bad = fakeEngine({ auth: async () => { throw new ApiKeyRefused('bad key', 401) } }).engine
    const res = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY }), ['x', 'v1', 'products'], { engine: bad, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(res?.status).toBe(401)
  })

  it('projects a list to the exposed fields only, and never returns a secret', async () => {
    const { store, logs } = memoryStore([endpoint()])
    const { engine, calls } = fakeEngine()
    const res = await serveCustomEndpoint(req('/api/x/v1/products?title=Shoe&sort=-price', { key: KEY }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(res?.status).toBe(200)
    const body = (await res!.json()) as { data: Record<string, unknown>[] }
    expect(body.data).toEqual([{ id: 1, title: 'Shoe', price: 9 }])
    const find = calls.find((c) => c.op === 'find')!
    expect(find.args.overrideAccess).toBe(false)
    expect(find.args.where).toEqual({ title: { equals: 'Shoe' } })
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ status: 200, keyId: 5, userId: 7, method: 'GET' })
    expect(JSON.stringify(logs[0])).not.toContain(KEY)
  })

  it('refuses an unknown query parameter with 400 and does not call the engine', async () => {
    const { store } = memoryStore([endpoint()])
    const { engine, calls } = fakeEngine()
    const res = await serveCustomEndpoint(req('/api/x/v1/products?secret=1', { key: KEY }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(res?.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('refuses a write with a field outside the whitelist, or a secret-named nested value', async () => {
    const { store } = memoryStore([endpoint({ allowCreate: true })])
    const { engine } = fakeEngine()
    const outside = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY, method: 'POST', body: JSON.stringify({ slug: 'x' }), headers: { 'content-type': 'application/json' } }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(outside?.status).toBe(403)
    const nested = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY, method: 'POST', body: JSON.stringify({ title: { meta: { password: 'p' } } }), headers: { 'content-type': 'application/json' } }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(nested?.status).toBe(403)
  })

  it('creates and updates through the engine when the endpoint allows it', async () => {
    const { store } = memoryStore([endpoint({ allowCreate: true, allowUpdate: true })])
    const { engine, calls } = fakeEngine()
    const made = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY, method: 'POST', body: JSON.stringify({ title: 'Hat', price: 3 }), headers: { 'content-type': 'application/json' } }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(made?.status).toBe(201)
    const patched = await serveCustomEndpoint(req('/api/x/v1/products/1', { key: KEY, method: 'PATCH', body: JSON.stringify({ price: 4 }), headers: { 'content-type': 'application/json' } }), ['x', 'v1', 'products', '1'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(patched?.status).toBe(200)
    expect(calls.map((c) => c.op)).toEqual(['create', 'update'])
    expect(calls[1].args.overrideAccess).toBe(false)
  })

  it('answers 429 with Retry-After when the key is over its limit, and does not call the engine', async () => {
    const { store } = memoryStore([endpoint({ rateLimitPerMinute: 1 })])
    const { engine, calls } = fakeEngine()
    const limited = async () => ({ limited: true, retryAfterSeconds: 17 })
    const res = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: limited, prune: false })
    expect(res?.status).toBe(429)
    expect(res?.headers.get('Retry-After')).toBe('17')
    expect(calls).toHaveLength(0)
  })

  it('an endpoint with a key list refuses a key that is not on it', async () => {
    const { store } = memoryStore([endpoint({ allowedKeyIds: [99] })])
    const { engine, calls } = fakeEngine()
    const res = await serveCustomEndpoint(req('/api/x/v1/products', { key: KEY }), ['x', 'v1', 'products'], { engine, store, now: () => 0, rateLimit: rateAllow, prune: false })
    expect(res?.status).toBe(403)
    expect(calls).toHaveLength(0)
  })
})

describe('API builder: admin writes', () => {
  const ctx = { reserved: new Set(['pages']), keyIds: new Set([5]), sources: SOURCES }
  it('creates, refuses a duplicate path, and checks the collection catalogue', async () => {
    const { store } = memoryStore()
    const ok = await createEndpoint(store, config(), ctx, 'now')
    expect(ok.ok).toBe(true)
    const dup = await createEndpoint(store, config(), ctx, 'now')
    expect(dup.ok).toBe(false)
    const bad = await createEndpoint(store, config({ fields: ['title', 'slug', 'nope'] }), ctx, 'now')
    expect(bad.ok).toBe(false)
  })
  it('updates keep the id, and a path change onto another endpoint is refused', async () => {
    const { store } = memoryStore()
    const a = await createEndpoint(store, config(), ctx, 'now')
    const b = await createEndpoint(store, config({ slug: 'other' }), ctx, 'now')
    if (!a.ok || !b.ok) throw new Error('setup')
    const clash = await updateEndpoint(store, b.value.id, config({ slug: 'products' }), ctx, 'later')
    expect(clash.ok).toBe(false)
    const fine = await updateEndpoint(store, a.value.id, config({ name: 'Renamed' }), ctx, 'later')
    expect(fine.ok && fine.value.id).toBe(a.value.id)
  })
  it('switching off keeps the rest of the definition', async () => {
    const { store } = memoryStore()
    const a = await createEndpoint(store, config(), ctx, 'now')
    if (!a.ok) throw new Error('setup')
    const off = await setEndpointEnabled(store, a.value.id, false, 'later')
    expect(off.ok && off.value.enabled).toBe(false)
    expect(off.ok && off.value.fields).toEqual(['title', 'price'])
  })
})
