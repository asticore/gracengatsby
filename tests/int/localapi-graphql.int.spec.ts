// Pure unit tests for src/localapi/graphql.ts's hybrid dispatcher - same
// "tiny fake Engine, injected via the module's own test-only parameter"
// style as localapi-rest.int.spec.ts's makeMockEngine (reused verbatim
// here). Real collection slugs ('products'/'orders'/'carts'/'transactions'/
// 'addresses') are the module's own hardcoded `COLLECTIONS` list, not
// injectable - same convention as `./registry.ts`'s slugs in the REST tests.
import { describe, expect, it, vi } from 'vitest'

import { handleEcommerceGraphQL } from '@/localapi/graphql'
import type { Engine } from '@/localapi/engine'

const PAGINATED_DOCS: { docs: Array<{ id: number; title: string }>; totalDocs: number; limit: number; totalPages: number; page: number; pagingCounter: number; hasPrevPage: boolean; hasNextPage: boolean; prevPage: number | null; nextPage: number | null } = {
  docs: [{ id: 1, title: 'Test' }],
  totalDocs: 1,
  limit: 10,
  totalPages: 1,
  page: 1,
  pagingCounter: 1,
  hasPrevPage: false,
  hasNextPage: false,
  prevPage: null,
  nextPage: null,
}

function makeMockEngine(overrides: Partial<Engine> = {}): Engine {
  const base = {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    config: {},
    collections: {},
    db: { migrate: vi.fn() },
    find: vi.fn().mockResolvedValue(PAGINATED_DOCS),
    findByID: vi.fn().mockResolvedValue({ id: 1, title: 'Test' }),
    count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
    findGlobal: vi.fn().mockResolvedValue({ id: 1 }),
    create: vi.fn().mockResolvedValue({ id: 2, title: 'Created' }),
    update: vi.fn().mockResolvedValue({ id: 1, title: 'Updated' }),
    delete: vi.fn().mockResolvedValue({ id: 1 }),
    updateGlobal: vi.fn().mockResolvedValue({ id: 1 }),
    login: vi.fn(),
    resetPassword: vi.fn(),
    forgotPassword: vi.fn(),
    auth: vi.fn().mockResolvedValue({ user: null }),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    unlock: vi.fn(),
  }
  return { ...base, ...overrides } as unknown as Engine
}

function req(query: string, variables?: Record<string, unknown>, operationName?: string, headers?: Record<string, string>): Request {
  return new Request('http://x/api/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables, operationName }),
  })
}

async function bodyOf(res: Response | null): Promise<{ data?: unknown; errors?: Array<{ message: string }> }> {
  if (!res) throw new Error('expected a Response, got null')
  return res.json()
}

describe('localapi/graphql - queries', () => {
  it('resolves a plural query (Products) via engine.find with overrideAccess: false', async () => {
    const engine = makeMockEngine()
    const res = await handleEcommerceGraphQL(req('query { Products(limit: 5) { docs totalDocs } }'), engine)
    const body = await bodyOf(res)
    expect(body.errors).toBeUndefined()
    expect((body.data as { Products: unknown }).Products).toEqual({ docs: PAGINATED_DOCS.docs, totalDocs: PAGINATED_DOCS.totalDocs })
    expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'products', limit: 5, overrideAccess: false }))
  })

  it('resolves a singular query (Order) via engine.findByID', async () => {
    const engine = makeMockEngine()
    const res = await handleEcommerceGraphQL(req('query { Order(id: 7) }'), engine)
    const body = await bodyOf(res)
    expect(body.errors).toBeUndefined()
    expect(body.data).toEqual({ Order: { id: 1, title: 'Test' } })
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'orders', id: 7, overrideAccess: false }))
  })

  it('threads a guest cart secret through to engine.findByID as req.query.secret', async () => {
    const engine = makeMockEngine()
    await handleEcommerceGraphQL(req('query { Cart(id: 3, secret: "s3cr3t") }'), engine)
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 3, req: { query: { secret: 's3cr3t' } } }))
  })

  it('passes engine.auth()-resolved user through to the resolver context', async () => {
    const user = { id: 9, email: 'owner@example.com' }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    await handleEcommerceGraphQL(req('query { Order(id: 1) }'), engine)
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ user }))
  })
})

describe('localapi/graphql - mutations', () => {
  it('resolves createProduct via engine.create', async () => {
    const engine = makeMockEngine()
    const res = await handleEcommerceGraphQL(req('mutation($data: JSON!) { createProduct(data: $data) }', { data: { title: 'New' } }), engine)
    const body = await bodyOf(res)
    expect(body.errors).toBeUndefined()
    expect(body.data).toEqual({ createProduct: { id: 2, title: 'Created' } })
    expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'products', data: { title: 'New' } }))
  })

  it('resolves updateAddress via engine.update, no overrideAccess override (engine default applies, matching REST)', async () => {
    const engine = makeMockEngine()
    await handleEcommerceGraphQL(req('mutation { updateAddress(id: 4, data: { line1: "1 Test St" }) }'), engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'addresses', id: 4, data: { line1: '1 Test St' } }))
    expect((engine.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('overrideAccess')
  })

  it('resolves deleteTransaction via engine.delete', async () => {
    const engine = makeMockEngine()
    const res = await handleEcommerceGraphQL(req('mutation { deleteTransaction(id: 5) }'), engine)
    const body = await bodyOf(res)
    expect(body.errors).toBeUndefined()
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'transactions', id: 5 }))
  })

  it('surfaces a resolver throw as a GraphQL error rather than an uncaught rejection', async () => {
    const engine = makeMockEngine({ create: vi.fn().mockRejectedValue(new Error('boom')) })
    const res = await handleEcommerceGraphQL(req('mutation($data: JSON!) { createProduct(data: $data) }', { data: {} }), engine)
    const body = await bodyOf(res)
    expect(body.errors?.[0]?.message).toContain('boom')
  })
})

describe('localapi/graphql - fallthrough to the reference engine (returns null)', () => {
  it('falls through for a query touching only a non-ecommerce field', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('query { Posts { docs { id } } }'), engine)).toBeNull()
  })

  it('falls through for a query mixing an ecommerce field with a non-ecommerce field', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('query { Products { docs { id } } Posts { docs { id } } }'), engine)).toBeNull()
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('falls through for a pure introspection query', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('query { __schema { queryType { name } } }'), engine)).toBeNull()
  })

  it('falls through for a subscription operation', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('subscription { Products { docs } }'), engine)).toBeNull()
  })

  it('falls through for a malformed query string', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('{ this is not valid graphql'), engine)).toBeNull()
  })

  it('falls through for a non-JSON request body', async () => {
    const engine = makeMockEngine()
    const request = new Request('http://x/api/graphql', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not json' })
    expect(await handleEcommerceGraphQL(request, engine)).toBeNull()
  })

  it('falls through when operationName does not match any operation in the document', async () => {
    const engine = makeMockEngine()
    expect(await handleEcommerceGraphQL(req('query A { Products { docs } }', undefined, 'B'), engine)).toBeNull()
  })

  it('leaves the request body readable for the reference-engine fallthrough handler', async () => {
    const engine = makeMockEngine()
    const request = req('query { Posts { docs { id } } }')
    const ours = await handleEcommerceGraphQL(request, engine)
    expect(ours).toBeNull()
    const body = (await request.json()) as { query: string }
    expect(body.query).toContain('Posts')
  })
})
