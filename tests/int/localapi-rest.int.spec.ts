// Pure unit tests for src/localapi/rest.ts's own routing/response-shaping
// logic - a mocked `Engine` (vi.fn() per member, same "tiny fake satisfying
// the real interface" style localapi-auth.int.spec.ts's makeFakeAuthDb and
// localapi-operations.int.spec.ts's makeFakeDb already establish), injected
// via handleRestRequest's own third (test-only) parameter. Real collection/
// global SLUGS are still read from the real `./registry.ts` (not injectable
// - it's a module-level constant, same as every other localapi module that
// imports it directly), so this file uses genuinely real slugs ('posts',
// 'users', 'header', 'site-settings') already known to exist in this app's
// 21 collections / 17 globals - no live DB or real engine construction
// happens anywhere in this file.
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Forbidden } from '@/localapi/access'
import { AuthenticationError, InvalidResetToken, LockedAuth } from '@/localapi/auth'
import type { Engine } from '@/localapi/engine'
import { NotFound as OperationsNotFound, ValidationError } from '@/localapi/operations'
import { NotFound as ReadNotFound } from '@/localapi/read-operations'
import { handleRestRequest } from '@/localapi/rest'

// Auto-mocked (not a live Stripe client) for the "payments: Stripe cart
// checkout" describe block below - each test that reaches the actual
// stripeAdapter.ts code (i.e. past the outer cart/product/email validation
// in rest.ts) sets its own `mockImplementation` on the default export, same
// spirit as this file's own `makeMockEngine` per-test overrides.
vi.mock('stripe', () => ({ default: vi.fn() }))
import Stripe from 'stripe'

/* -------------------------------------------------------------------------- */
/* Test fixtures                                                              */
/* -------------------------------------------------------------------------- */

const PAGINATED_DOCS: { docs: Array<{ id: number }>; totalDocs: number; limit: number; totalPages: number; page: number; pagingCounter: number; hasPrevPage: boolean; hasNextPage: boolean; prevPage: number | null; nextPage: number | null } = {
  docs: [{ id: 1 }],
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
    findByID: vi.fn().mockResolvedValue({ id: 1 }),
    count: vi.fn().mockResolvedValue({ totalDocs: 1 }),
    findGlobal: vi.fn().mockResolvedValue({ id: 1, siteName: 'Test' }),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    update: vi.fn().mockResolvedValue({ id: 1 }),
    delete: vi.fn().mockResolvedValue({ id: 1 }),
    updateGlobal: vi.fn().mockResolvedValue({ id: 1, siteName: 'Updated' }),
    login: vi.fn().mockResolvedValue({ user: { id: 1, email: 'a@b.com' }, token: 'tok', exp: 1234 }),
    resetPassword: vi.fn().mockResolvedValue({ user: { id: 1, email: 'a@b.com' }, token: 'tok' }),
    forgotPassword: vi.fn().mockResolvedValue('reset-token'),
    auth: vi.fn().mockResolvedValue({ user: null }),
    logout: vi.fn().mockResolvedValue({ message: 'Logged out successfully.' }),
    refreshToken: vi.fn().mockResolvedValue({ exp: 5678, token: 'newtok', user: { id: 1, email: 'a@b.com' }, setCookie: true as const }),
    unlock: vi.fn().mockResolvedValue(true),
  }
  return { ...base, ...overrides } as unknown as Engine
}

function req(method: string, url: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/* -------------------------------------------------------------------------- */
/* Fallthrough (returns null) cases                                          */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - fallthrough to the reference engine', () => {
  it('returns null for an empty slug', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api'), [], engine)).toBeNull()
  })

  it('returns null for an unrecognized collection slug', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/nonsense'), ['nonsense'], engine)).toBeNull()
  })

  it('returns null for an unrecognized global slug', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/globals/nonsense'), ['globals', 'nonsense'], engine)).toBeNull()
  })

  it('returns null for a non-numeric, non-route path segment', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/posts/not-a-number'), ['posts', 'not-a-number'], engine)).toBeNull()
  })

  it('returns null for unhandled method/sub-path combos', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('DELETE', 'http://x/api/faqs/versions'), ['faqs', 'versions'], engine)).toBeNull()
    expect(await handleRestRequest(req('GET', 'http://x/api/posts/5/duplicate'), ['posts', '5', 'duplicate'], engine)).toBeNull()
  })

  it('treats an auth route name on a non-auth collection as a plain (invalid) id, not an auth route', async () => {
    const engine = makeMockEngine()
    // 'posts' is not the auth collection - POST /posts/login should fall through, not call engine.login
    expect(await handleRestRequest(req('POST', 'http://x/api/posts/login'), ['posts', 'login'], engine)).toBeNull()
    expect(engine.login).not.toHaveBeenCalled()
  })

  it('returns null for a global with an extra path segment', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/globals/header/versions'), ['globals', 'header', 'versions'], engine)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Collection CRUD                                                           */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - collection list/create/byID/count', () => {
  it('GET / returns the raw PaginatedDocs shape, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/posts?limit=5&sort=-createdAt'), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = await res!.json()
    expect(body).toEqual(PAGINATED_DOCS)
    expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', limit: 5, sort: '-createdAt' }))
  })

  it('POST / creates and returns {doc, message}, 201', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/posts', { title: 'Hi' }), ['posts'], engine)
    expect(res!.status).toBe(201)
    const body = await res!.json()
    expect(body).toEqual({ doc: { id: 1 }, message: 'Successfully created.' })
    expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', data: { title: 'Hi' } }))
  })

  it('GET /:id returns the raw doc, no wrapper, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/1'), ['posts', '1'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ id: 1 })
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', id: 1 }))
  })

  it('PATCH /:id updates and returns {doc, message}, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('PATCH', 'http://x/api/posts/1', { title: 'New' }), ['posts', '1'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ doc: { id: 1 }, message: 'Updated successfully.' })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', id: 1, data: { title: 'New' } }))
  })

  it('DELETE /:id deletes and returns {doc, message}, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('DELETE', 'http://x/api/posts/1'), ['posts', '1'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ doc: { id: 1 }, message: 'Deleted successfully.' })
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', id: 1 }))
  })

  it('GET /count returns {totalDocs}, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/count'), ['posts', 'count'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ totalDocs: 1 })
  })

  it('passes the authenticated user through to engine calls', async () => {
    const user = { id: 42, email: 'me@x.com' }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    await handleRestRequest(req('GET', 'http://x/api/posts'), ['posts'], engine)
    expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ user }))
  })

  it('a malformed JSON body on create is treated as an empty object, not a crash', async () => {
    const engine = makeMockEngine()
    const badReq = new Request('http://x/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not valid json' })
    const res = await handleRestRequest(badReq, ['posts'], engine)
    expect(res!.status).toBe(201)
    expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({ data: {} }))
  })
})

/* -------------------------------------------------------------------------- */
/* Duplicate (POST /:id/duplicate) - Stage 7 item, previously deferred        */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - POST /:id/duplicate', () => {
  // 'posts' is a real collection (registry-backed) whose 'slug' field is
  // `type: 'text', unique: true` - see src/collections/Posts.ts. Exercises
  // the real applyBeforeDuplicate recursion via a real registry entry rather
  // than a hand-built fields array, same "read real slugs off the real
  // registry" convention this whole file already uses.
  it('strips id/createdAt/updatedAt/_status, appends " - Copy" to the unique text field, creates as a draft', async () => {
    const source = { id: 7, title: 'Hello World', slug: 'hello-world', createdAt: '2026-01-01', updatedAt: '2026-01-02', _status: 'published' }
    const engine = makeMockEngine({
      findByID: vi.fn().mockResolvedValue(source),
      create: vi.fn().mockResolvedValue({ id: 8, title: 'Hello World', slug: 'hello-world - Copy' }),
    })
    const res = await handleRestRequest(req('POST', 'http://x/api/posts/7/duplicate'), ['posts', '7', 'duplicate'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ doc: { id: 8, title: 'Hello World', slug: 'hello-world - Copy' }, message: 'Successfully duplicated.' })

    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', id: 7, overrideAccess: false }))
    expect(engine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        data: { title: 'Hello World', slug: 'hello-world - Copy' },
        draft: true,
      }),
    )
    const createdData = (engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data
    expect(createdData).not.toHaveProperty('id')
    expect(createdData).not.toHaveProperty('createdAt')
    expect(createdData).not.toHaveProperty('updatedAt')
    expect(createdData).not.toHaveProperty('_status')
  })

  it('a non-numeric id segment falls through (null), same as every other /:id route', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/posts/abc/duplicate'), ['posts', 'abc', 'duplicate'], engine)
    expect(res).toBeNull()
    expect(engine.findByID).not.toHaveBeenCalled()
  })

  it('GET (not POST) to the same path falls through (null)', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/7/duplicate'), ['posts', '7', 'duplicate'], engine)
    expect(res).toBeNull()
    expect(engine.findByID).not.toHaveBeenCalled()
  })

  it('passes the authenticated user through to both findByID and create', async () => {
    const user = { id: 42, email: 'me@x.com' }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }), findByID: vi.fn().mockResolvedValue({ id: 7, title: 'Hi', slug: 'hi' }) })
    await handleRestRequest(req('POST', 'http://x/api/posts/7/duplicate'), ['posts', '7', 'duplicate'], engine)
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ user }))
    expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({ user }))
  })
})

/* -------------------------------------------------------------------------- */
/* Bulk PATCH/DELETE (no id) - Stage 7 item, previously deferred              */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - bulk PATCH/DELETE (no id)', () => {
  it('PATCH with no `where` query is a 400, matching the reference engine\'s own missing-where error, engine.find never called', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('PATCH', 'http://x/api/posts', { title: 'x' }), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ errors: [{ message: "Missing 'where' query of documents to update." }] })
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('DELETE with no `where` query is a 400, matching the reference engine\'s own missing-where error', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('DELETE', 'http://x/api/posts'), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ errors: [{ message: "Missing 'where' query of documents to delete." }] })
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('PATCH with `where` matching 2 docs updates each one, returns {docs, errors: [], message} at 200', async () => {
    const engine = makeMockEngine({
      find: vi.fn().mockResolvedValue({ ...PAGINATED_DOCS, docs: [{ id: 1 }, { id: 2 }] }),
      update: vi.fn().mockImplementation(({ id }: { id: number }) => Promise.resolve({ id, title: 'Updated' })),
    })
    const res = await handleRestRequest(req('PATCH', 'http://x/api/posts?where[category][equals]=news', { title: 'Updated' }), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ docs: [{ id: 1, title: 'Updated' }, { id: 2, title: 'Updated' }], errors: [], message: 'Updated 2 items successfully.' })
    expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts', pagination: false, overrideAccess: false }))
    expect(engine.update).toHaveBeenCalledTimes(2)
  })

  it('DELETE with `where` matching zero docs is a 200 with empty docs/errors (not an error)', async () => {
    const engine = makeMockEngine({ find: vi.fn().mockResolvedValue({ ...PAGINATED_DOCS, docs: [] }) })
    const res = await handleRestRequest(req('DELETE', 'http://x/api/posts?where[category][equals]=nonexistent'), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ docs: [], errors: [], message: 'Deleted 0 items successfully.' })
    expect(engine.delete).not.toHaveBeenCalled()
  })

  it('PATCH where one of two matched docs fails is a 400 with partial docs/errors', async () => {
    const engine = makeMockEngine({
      find: vi.fn().mockResolvedValue({ ...PAGINATED_DOCS, docs: [{ id: 1 }, { id: 2 }] }),
      update: vi.fn().mockImplementation(({ id }: { id: number }) => (id === 1 ? Promise.resolve({ id, title: 'Updated' }) : Promise.reject(new Error('boom')))),
    })
    const res = await handleRestRequest(req('PATCH', 'http://x/api/posts?where[category][equals]=news', { title: 'Updated' }), ['posts'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ docs: [{ id: 1, title: 'Updated' }], errors: [{ id: 2, message: 'boom' }], message: 'Unable to update 1 item out of 2 total.' })
  })
})

/* -------------------------------------------------------------------------- */
/* Cart guest secret (Stage 10 Ecommerce, Layer 2)                           */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - carts ?secret= threading', () => {
  it('GET /:id passes ?secret= onto req.query.secret for access functions to read', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/carts/1?secret=abc123'), ['carts', '1'], engine)
    expect(res!.status).toBe(200)
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, req: { query: { secret: 'abc123' } } }))
  })

  it('PATCH /:id passes ?secret= through the same way', async () => {
    const engine = makeMockEngine()
    await handleRestRequest(req('PATCH', 'http://x/api/carts/1?secret=abc123', { items: [] }), ['carts', '1'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, req: { query: { secret: 'abc123' } } }))
  })

  it('DELETE /:id passes ?secret= through the same way', async () => {
    const engine = makeMockEngine()
    await handleRestRequest(req('DELETE', 'http://x/api/carts/1?secret=abc123'), ['carts', '1'], engine)
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, req: { query: { secret: 'abc123' } } }))
  })

  it('with no ?secret=, req.query.secret is undefined rather than a missing key', async () => {
    const engine = makeMockEngine()
    await handleRestRequest(req('GET', 'http://x/api/carts/1'), ['carts', '1'], engine)
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ req: { query: { secret: undefined } } }))
  })
})

/* -------------------------------------------------------------------------- */
/* Cart item endpoints (Stage 10 Ecommerce, Layer 2 remainder)               */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - cart item endpoints', () => {
  it('add-item: appends a new item and passes the body secret through as req.query.secret', async () => {
    const engine = makeMockEngine({
      findByID: vi.fn().mockResolvedValue({ id: 1, items: [] }),
      update: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'x', product: 5, quantity: 2 }] }),
    })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/add-item', { item: { product: 5 }, quantity: 2, secret: 'abc' }), ['carts', '1', 'add-item'], engine)
    const body = await res!.json()
    expect(res!.status).toBe(200)
    expect(body).toEqual({ success: true, message: 'Item added to cart', cart: { id: 1, items: [{ id: 'x', product: 5, quantity: 2 }] } })
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, req: { query: { secret: 'abc' } } }))
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, data: { items: [{ product: 5, quantity: 2 }] } }))
  })

  it('add-item: increments quantity when the product already exists in the cart', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'x', product: 5, quantity: 2 }] }) })
    await handleRestRequest(req('POST', 'http://x/api/carts/1/add-item', { item: { product: 5 }, quantity: 3 }), ['carts', '1', 'add-item'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ id: 'x', product: 5, quantity: 5 }] } }))
  })

  it('add-item: defaults quantity to 1 when not provided', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [] }) })
    await handleRestRequest(req('POST', 'http://x/api/carts/1/add-item', { item: { product: 5 } }), ['carts', '1', 'add-item'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ product: 5, quantity: 1 }] } }))
  })

  it('add-item: 400 when item.product is missing', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/add-item', { item: {} }), ['carts', '1', 'add-item'], engine)
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ success: false, message: 'Item with product ID is required', cart: null })
    expect(engine.findByID).not.toHaveBeenCalled()
  })

  it('add-item: 404 when the cart does not exist', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue(null) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/add-item', { item: { product: 5 } }), ['carts', '1', 'add-item'], engine)
    expect(res!.status).toBe(404)
    expect(await res!.json()).toEqual({ success: false, message: 'Cart with ID 1 not found', cart: null })
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('remove-item: splices the matching item out by its row id', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 1 }, { id: 'b', product: 2, quantity: 1 }] }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/remove-item', { itemID: 'a' }), ['carts', '1', 'remove-item'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toMatchObject({ success: true, message: 'Item removed from cart' })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ id: 'b', product: 2, quantity: 1 }] } }))
  })

  it('remove-item: 400 when itemID is missing', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/remove-item', {}), ['carts', '1', 'remove-item'], engine)
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ success: false, message: 'Item ID is required', cart: null })
  })

  it('remove-item: 404 when the item is not found in an existing cart', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [] }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/remove-item', { itemID: 'missing' }), ['carts', '1', 'remove-item'], engine)
    expect(res!.status).toBe(404)
    expect(await res!.json()).toEqual({ success: false, message: 'Item with ID missing not found in cart', cart: { id: 1, items: [] } })
  })

  it('update-item: sets quantity to a direct value', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 2 }] }) })
    await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a', quantity: 5 }), ['carts', '1', 'update-item'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ id: 'a', product: 1, quantity: 5 }] } }))
  })

  it('update-item: applies { $inc } relative to the current quantity', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 2 }] }) })
    await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a', quantity: { $inc: -1 } }), ['carts', '1', 'update-item'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ id: 'a', product: 1, quantity: 1 }] } }))
  })

  it('update-item: removes the item when quantity reaches 0 and removeOnZero is not false', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 1 }] }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a', quantity: { $inc: -1 } }), ['carts', '1', 'update-item'], engine)
    expect(await res!.json()).toMatchObject({ message: 'Item removed from cart' })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [] } }))
  })

  it('update-item: floors at 1 (never removes) when removeOnZero is explicitly false', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 1 }] }) })
    await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a', quantity: { $inc: -5 }, removeOnZero: false }), ['carts', '1', 'update-item'], engine)
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ data: { items: [{ id: 'a', product: 1, quantity: 1 }] } }))
  })

  it('update-item: 400 for an invalid quantity shape', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a', quantity: 'five' }), ['carts', '1', 'update-item'], engine)
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ success: false, message: 'Quantity must be a number or { $inc: number }', cart: null })
  })

  it('update-item: 400 when quantity is missing entirely', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/update-item', { itemID: 'a' }), ['carts', '1', 'update-item'], engine)
    expect(res!.status).toBe(400)
    expect(await res!.json()).toEqual({ success: false, message: 'Quantity is required', cart: null })
  })

  it('clear: empties items', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 'a', product: 1, quantity: 1 }] }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/clear', {}), ['carts', '1', 'clear'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toMatchObject({ success: true, message: 'Cart cleared' })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, data: { items: [] } }))
  })

  it('clear: 404 when the cart does not exist', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue(null) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/clear', {}), ['carts', '1', 'clear'], engine)
    expect(res!.status).toBe(404)
  })

  it('merge: 401 when the caller is not authenticated', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceCartID: 2, sourceSecret: 's' }), ['carts', '1', 'merge'], engine)
    expect(res!.status).toBe(401)
    expect(await res!.json()).toEqual({ success: false, message: 'Authentication required', cart: null })
    expect(engine.find).not.toHaveBeenCalled()
  })

  it('merge: 400 when sourceCartID or sourceSecret is missing', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: { id: 1 } }) })
    const res1 = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceSecret: 's' }), ['carts', '1', 'merge'], engine)
    expect(res1!.status).toBe(400)
    expect(await res1!.json()).toEqual({ success: false, message: 'Source cart ID is required', cart: null })

    const res2 = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceCartID: 2 }), ['carts', '1', 'merge'], engine)
    expect(res2!.status).toBe(400)
    expect(await res2!.json()).toEqual({ success: false, message: 'Source cart secret is required', cart: null })
  })

  it('merge: 404 when the source cart/secret pair does not match (uses overrideAccess since the secret IS the access check)', async () => {
    const engine = makeMockEngine({
      auth: vi.fn().mockResolvedValue({ user: { id: 1 } }),
      find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0, limit: 1, totalPages: 0, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null }),
    })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceCartID: 2, sourceSecret: 'wrong' }), ['carts', '1', 'merge'], engine)
    expect(res!.status).toBe(404)
    expect(await res!.json()).toEqual({ success: false, message: 'Source cart with ID 2 not found or secret mismatch', cart: null })
    expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', overrideAccess: true, where: { and: [{ id: { equals: 2 } }, { secret: { equals: 'wrong' } }] } }))
  })

  it('merge: combines matching-product quantities, keeps non-matching items, and deletes the source cart', async () => {
    const engine = makeMockEngine({
      auth: vi.fn().mockResolvedValue({ user: { id: 1 } }),
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 2, items: [{ id: 'g1', product: 1, quantity: 2 }, { id: 'g2', product: 3, quantity: 1 }] }],
        totalDocs: 1, limit: 1, totalPages: 1, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null,
      }),
      findByID: vi.fn().mockResolvedValue({ id: 1, items: [{ id: 't1', product: 1, quantity: 1 }] }),
    })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceCartID: 2, sourceSecret: 's' }), ['carts', '1', 'merge'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toMatchObject({ success: true, message: 'Merged 2 items from guest cart' })
    expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'carts',
      id: 1,
      data: { items: [{ id: 't1', product: 1, quantity: 3 }, { product: 3, quantity: 1 }] },
    }))
    expect(engine.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 2, overrideAccess: true }))
  })

  it('merge: 404 when the target cart does not exist/belong to the caller, and never deletes the source cart', async () => {
    const engine = makeMockEngine({
      auth: vi.fn().mockResolvedValue({ user: { id: 1 } }),
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 2, items: [] }],
        totalDocs: 1, limit: 1, totalPages: 1, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null,
      }),
      findByID: vi.fn().mockResolvedValue(null),
    })
    const res = await handleRestRequest(req('POST', 'http://x/api/carts/1/merge', { sourceCartID: 2, sourceSecret: 's' }), ['carts', '1', 'merge'], engine)
    expect(res!.status).toBe(404)
    expect(await res!.json()).toEqual({ success: false, message: 'Target cart with ID 1 not found', cart: null })
    expect(engine.delete).not.toHaveBeenCalled()
  })

  it('non-carts collections still fall through for a 2-segment sub-route', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('POST', 'http://x/api/posts/1/add-item', {}), ['posts', '1', 'add-item'], engine)).toBeNull()
  })

  it('an unrecognized cart sub-route falls through', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('POST', 'http://x/api/carts/1/whatever', {}), ['carts', '1', 'whatever'], engine)).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* Payments: Stripe cart checkout (Stage 10 Ecommerce, Layer 3)              */
/* -------------------------------------------------------------------------- */

function makeFakeStripe(overrides: { customers?: Partial<{ list: unknown; create: unknown }>; paymentIntents?: Partial<{ create: unknown; retrieve: unknown }>; webhooks?: Partial<{ constructEvent: unknown }> } = {}) {
  return {
    customers: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      ...overrides.customers,
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: 'pi_1', client_secret: 'secret_1', amount: 50, currency: 'aud' }),
      retrieve: vi.fn().mockResolvedValue({ status: 'succeeded', amount: 50, currency: 'aud', metadata: {} }),
      ...overrides.paymentIntents,
    },
    webhooks: {
      constructEvent: vi.fn(),
      ...overrides.webhooks,
    },
  }
}

describe('localapi/rest - payments: Stripe cart checkout', () => {
  // Only the two success tests below stub STRIPE_SECRET_KEY (its absence is
  // itself asserted implicitly by every earlier-failing-validation test never
  // reaching the adapter) - unstub after each so it never leaks into other
  // describe blocks in this file.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('POST /payments/stripe/webhooks', () => {
    // CORRECTION 2026-09-26: this endpoint used to always fall through to
    // the reference engine's own registered stripeAdapter() (serving the unrelated
    // membership-subscription flow) - it is now fully reproduced here,
    // closing the last real blocker to removing the real `shopPlugin()`
    // call. See stripeAdapter.ts's header for the full history.

    it('200 {received: true}, no crash, when STRIPE_WEBHOOK_SECRET/STRIPE_SECRET_KEY are not configured (this sandbox\'s default) - matches the real handler\'s own early-exit shape, never falls through', async () => {
      const engine = makeMockEngine()
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/webhooks', {}), ['payments', 'stripe', 'webhooks'], engine)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ received: true })
    })

    it('200 and calls the matching membershipWebhooks handler for a validly-signed event', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fake')
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const fakeEvent = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled' } } }
      const fakeStripe = makeFakeStripe({ webhooks: { constructEvent: vi.fn().mockReturnValue(fakeEvent) } })
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)
      const find = vi.fn().mockResolvedValue({
        docs: [{ id: 7, cancelledAt: null }],
        totalDocs: 1, limit: 1, totalPages: 1, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null,
      })
      const update = vi.fn().mockResolvedValue({ id: 7 })
      const engine = makeMockEngine({ find, update })

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/webhooks', {}, { 'stripe-signature': 'sig_1' }), ['payments', 'stripe', 'webhooks'], engine)

      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ received: true })
      expect(fakeStripe.webhooks.constructEvent).toHaveBeenCalledWith(expect.any(String), 'sig_1', 'whsec_fake')
      // customer.subscription.deleted's own handler (membershipWebhooks) looks the
      // membership up by externalSubscriptionId, then marks it expired.
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        collection: 'memberships',
        id: 7,
        data: expect.objectContaining({ status: 'expired' }),
        overrideAccess: true,
      }))
    })

    it('400 {received: true} when the signature fails verification, and no membershipWebhooks handler runs', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fake')
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const constructEvent = vi.fn().mockImplementation(() => { throw new Error('bad signature') })
      const fakeStripe = makeFakeStripe({ webhooks: { constructEvent } })
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)
      const update = vi.fn()
      const engine = makeMockEngine({ update })

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/webhooks', {}, { 'stripe-signature': 'sig_bad' }), ['payments', 'stripe', 'webhooks'], engine)

      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ received: true })
      expect(update).not.toHaveBeenCalled()
    })

    it('200, no-op, for a validly-signed event type membershipWebhooks does not handle', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fake')
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const fakeEvent = { type: 'payment_intent.created', data: { object: {} } }
      const fakeStripe = makeFakeStripe({ webhooks: { constructEvent: vi.fn().mockReturnValue(fakeEvent) } })
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)
      const update = vi.fn()
      const engine = makeMockEngine({ update })

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/webhooks', {}, { 'stripe-signature': 'sig_1' }), ['payments', 'stripe', 'webhooks'], engine)

      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ received: true })
      expect(update).not.toHaveBeenCalled()
    })

    it('skips signature verification entirely (and never calls a handler) when the stripe-signature header is missing, even with both env vars configured', async () => {
      vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fake')
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const fakeStripe = makeFakeStripe()
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)
      const engine = makeMockEngine()

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/webhooks', {}), ['payments', 'stripe', 'webhooks'], engine)

      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ received: true })
      expect(fakeStripe.webhooks.constructEvent).not.toHaveBeenCalled()
    })
  })

  describe('POST /payments/stripe/initiate', () => {
    it('400 when cartID is missing', async () => {
      const engine = makeMockEngine()
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'Cart ID is required.' })
    })

    it('400 when a guest omits customerEmail', async () => {
      const engine = makeMockEngine()
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1 }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'A customer email is required to make a purchase.' })
      expect(engine.findByID).not.toHaveBeenCalled()
    })

    it('404 when the cart does not exist', async () => {
      const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue(null) })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(404)
      expect(await res!.json()).toEqual({ message: 'Cart with ID 1 not found.' })
    })

    it('400 when the cart has no items', async () => {
      const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [] }) })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'Cart is required and must contain at least one item.' })
    })

    it('404 when a cart item references a product that does not exist', async () => {
      const findByID = vi.fn().mockResolvedValueOnce({ id: 1, items: [{ product: 5, quantity: 1 }], currency: 'AUD' }).mockResolvedValueOnce(null)
      const engine = makeMockEngine({ findByID })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(404)
      expect(await res!.json()).toEqual({ message: 'Product with ID 5 not found.' })
    })

    it('400 when a product has no priceInAUD', async () => {
      const findByID = vi.fn().mockResolvedValueOnce({ id: 1, items: [{ product: 5, quantity: 1 }], currency: 'AUD' }).mockResolvedValueOnce({ id: 5 })
      const engine = makeMockEngine({ findByID })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'Product does not have a price in AUD.' })
    })

    it('400 when a product is out of stock or does not have enough inventory', async () => {
      const findByID = vi.fn().mockResolvedValueOnce({ id: 1, items: [{ product: 5, quantity: 2 }], currency: 'AUD' }).mockResolvedValueOnce({ id: 5, priceInAUD: 25, inventory: 1 })
      const engine = makeMockEngine({ findByID })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'Product is out of stock or does not have enough inventory.' })
    })

    it('success: creates a Stripe PaymentIntent, records a pending transaction, and returns the client secret', async () => {
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const fakeStripe = makeFakeStripe()
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)
      const findByID = vi.fn().mockResolvedValueOnce({ id: 1, items: [{ product: 5, quantity: 2 }], subtotal: 50, currency: 'AUD' }).mockResolvedValueOnce({ id: 5, priceInAUD: 25, inventory: 10 })
      const engine = makeMockEngine({ findByID })

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/initiate', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'initiate'], engine)

      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ clientSecret: 'secret_1', message: 'Payment initiated successfully', paymentIntentID: 'pi_1' })
      expect(fakeStripe.customers.create).toHaveBeenCalledWith({ email: 'a@b.com' })
      // cart.subtotal (50, built from priceInAUD - whole dollars) must be converted to
      // Stripe's smallest-unit cents (5000) at this boundary - see stripeAdapter.ts's
      // header comment (2026-09-26 unit-convention fix, plan doc What's-left item #12).
      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000, currency: 'AUD', customer: 'cus_1' }))
      expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({
        collection: 'transactions',
        data: expect.objectContaining({ status: 'pending', paymentMethod: 'stripe', customerEmail: 'a@b.com' }),
        overrideAccess: true,
      }))
    })
  })

  describe('POST /payments/stripe/confirm-order', () => {
    it('400 when paymentIntentID is missing', async () => {
      const engine = makeMockEngine({ findByID: vi.fn().mockResolvedValue({ id: 1, items: [] }) })
      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/confirm-order', { cartID: 1, customerEmail: 'a@b.com' }), ['payments', 'stripe', 'confirm-order'], engine)
      expect(res!.status).toBe(400)
      expect(await res!.json()).toEqual({ message: 'PaymentIntent ID is required' })
    })

    it('success: confirms the PaymentIntent, creates the order, marks the cart purchased, and decrements inventory - queried by the flattened `stripePaymentIntentID` column key, not a dotted path', async () => {
      vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fake')
      const fakeStripe = makeFakeStripe({
        paymentIntents: {
          retrieve: vi.fn().mockResolvedValue({
            status: 'succeeded',
            amount: 50,
            currency: 'aud',
            metadata: { cartID: '1', cartItemsSnapshot: JSON.stringify([{ product: 5, quantity: 2 }]), shippingAddress: 'null' },
          }),
        },
      })
      vi.mocked(Stripe).mockImplementation(function () { return fakeStripe } as unknown as typeof Stripe)

      const findByID = vi.fn().mockResolvedValueOnce({ id: 1, items: [{ product: 5, quantity: 2 }], currency: 'AUD' }).mockResolvedValueOnce({ id: 5, inventory: 10 })
      const find = vi.fn().mockResolvedValue({
        docs: [{ id: 10, items: [{ product: 5, quantity: 2 }] }],
        totalDocs: 1, limit: 1, totalPages: 1, page: 1, pagingCounter: 1, hasPrevPage: false, hasNextPage: false, prevPage: null, nextPage: null,
      })
      const create = vi.fn().mockResolvedValue({ id: 99 })
      const engine = makeMockEngine({ findByID, find, create })

      const res = await handleRestRequest(req('POST', 'http://x/api/payments/stripe/confirm-order', { cartID: 1, customerEmail: 'a@b.com', paymentIntentID: 'pi_1' }), ['payments', 'stripe', 'confirm-order'], engine)

      expect(res!.status).toBe(200)
      expect(await res!.json()).toEqual({ message: 'Payment initiated successfully', orderID: 99, transactionID: 10 })
      expect(engine.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'transactions', where: { stripePaymentIntentID: { equals: 'pi_1' } } }))
      expect(engine.create).toHaveBeenCalledWith(expect.objectContaining({ collection: 'orders', data: expect.objectContaining({ status: 'processing', transactions: [10] }) }))
      expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'carts', id: 1, data: expect.objectContaining({ purchasedAt: expect.any(String) }) }))
      expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'transactions', id: 10, data: { order: 99, status: 'succeeded' } }))
      expect(engine.update).toHaveBeenCalledWith(expect.objectContaining({ collection: 'products', id: 5, data: { inventory: 8 }, draft: false }))
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Globals                                                                    */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - globals', () => {
  it('GET /globals/:slug returns the raw doc, no wrapper, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/globals/header'), ['globals', 'header'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ id: 1, siteName: 'Test' })
    expect(engine.findGlobal).toHaveBeenCalledWith(expect.objectContaining({ slug: 'header' }))
  })

  it('POST /globals/:slug updates and returns {message, result} - NOT {doc}, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/globals/site-settings', { siteName: 'Updated' }), ['globals', 'site-settings'], engine)
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as Record<string, unknown>
    expect(body.result).toEqual({ id: 1, siteName: 'Updated' })
    expect(body.doc).toBeUndefined()
    expect(engine.updateGlobal).toHaveBeenCalledWith(expect.objectContaining({ slug: 'site-settings', data: { siteName: 'Updated' } }))
  })
})

/* -------------------------------------------------------------------------- */
/* Auth endpoints (all under the 'users' collection)                        */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - auth endpoints', () => {
  it('POST /users/login returns {message, user, token, exp} with a Set-Cookie, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/login', { email: 'a@b.com', password: 'x' }), ['users', 'login'], engine)
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as Record<string, unknown>
    expect(body.message).toBe('Authentication Passed')
    expect(body.token).toBe('tok')
    const setCookie = res!.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('engage-token=tok')
    expect(setCookie).toContain('HttpOnly=true')
    expect(setCookie).toContain('SameSite=Lax')
    expect(engine.login).toHaveBeenCalledWith({ collection: 'users', data: { email: 'a@b.com', password: 'x' } })
  })

  it('POST /users/login maps a thrown AuthenticationError to 401', async () => {
    const engine = makeMockEngine({ login: vi.fn().mockRejectedValue(new AuthenticationError()) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/login', { email: 'a@b.com', password: 'wrong' }), ['users', 'login'], engine)
    expect(res!.status).toBe(401)
    const body = (await res!.json()) as { errors: Array<{ name?: string; message: string }> }
    expect(body.errors[0].name).toBe('AuthenticationError')
  })

  it('POST /users/login maps a thrown LockedAuth to 423', async () => {
    const engine = makeMockEngine({ login: vi.fn().mockRejectedValue(new LockedAuth()) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/login', { email: 'a@b.com', password: 'wrong' }), ['users', 'login'], engine)
    expect(res!.status).toBe(423)
  })

  it('POST /users/logout returns {message}, 200, with an expired Set-Cookie', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/logout'), ['users', 'logout'], engine)
    expect(res!.status).toBe(200)
    expect((await res!.json()) as { message: string }).toEqual({ message: 'Logout successful.' })
    const setCookie = res!.headers.get('Set-Cookie') ?? ''
    expect(setCookie).toContain('engage-token=;')
    expect(engine.logout).toHaveBeenCalledWith(expect.objectContaining({ collection: 'users', allSessions: false }))
  })

  it('POST /users/logout?allSessions=true passes allSessions through', async () => {
    const engine = makeMockEngine()
    await handleRestRequest(req('POST', 'http://x/api/users/logout?allSessions=true'), ['users', 'logout'], engine)
    expect(engine.logout).toHaveBeenCalledWith(expect.objectContaining({ allSessions: true }))
  })

  it('GET /users/me returns {user: null, message} when unauthenticated', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/users/me'), ['users', 'me'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ user: null, message: 'Account' })
  })

  it('GET /users/me returns {user, message, token, exp} when authenticated via cookie', async () => {
    const user = { id: 1, email: 'a@b.com' }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    // A syntactically JWT-shaped token (header.engine.signature) so decodeJwtExpUnsafe can read `exp` back out.
    const claims = Buffer.from(JSON.stringify({ exp: 999 })).toString('base64url')
    const token = `header.${claims}.sig`
    const res = await handleRestRequest(req('GET', 'http://x/api/users/me', undefined, { Cookie: `engage-token=${token}` }), ['users', 'me'], engine)
    const body = (await res!.json()) as Record<string, unknown>
    expect(body.user).toEqual(user)
    expect(body.message).toBe('Account')
    expect(body.token).toBe(token)
    expect(body.exp).toBe(999)
  })

  it('POST /users/refresh-token renames the engine\'s token field to refreshedToken and sets a cookie', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/refresh-token'), ['users', 'refresh-token'], engine)
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as Record<string, unknown>
    expect(body.refreshedToken).toBe('newtok')
    expect(body).not.toHaveProperty('token')
    expect(body.strategy).toBe('local-jwt')
    expect(res!.headers.get('Set-Cookie')).toContain('engage-token=newtok')
  })

  it('POST /users/forgot-password always returns {message: "Success"}, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/forgot-password', { email: 'nobody@x.com' }), ['users', 'forgot-password'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ message: 'Success' })
  })

  it('POST /users/reset-password returns {message, user, token} with a Set-Cookie, 200', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/reset-password', { password: 'new', token: 'reset-tok' }), ['users', 'reset-password'], engine)
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as Record<string, unknown>
    expect(body.message).toBe('Password reset successfully.')
    expect(res!.headers.get('Set-Cookie')).toContain('engage-token=tok')
  })

  it('POST /users/reset-password maps a thrown InvalidResetToken to 400', async () => {
    const engine = makeMockEngine({ resetPassword: vi.fn().mockRejectedValue(new InvalidResetToken()) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/reset-password', { password: 'new', token: 'bad' }), ['users', 'reset-password'], engine)
    expect(res!.status).toBe(400)
  })

  it('POST /users/unlock returns {message: "Success"}, 200 for an authenticated caller', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: { id: 1, email: 'a@b.com' } }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/unlock', { email: 'a@b.com' }), ['users', 'unlock'], engine)
    expect(res!.status).toBe(200)
    expect(await res!.json()).toEqual({ message: 'Success' })
  })

  // The reference engine's `users` collection has no explicit `access.unlock`, so its
  // sanitize step fills in `auth/defaultAccess.js`'s own default -
  // `({req:{user}}) => Boolean(user)` - ANY authenticated user, but never an
  // anonymous one. Confirmed empirically against the reference engine's own REST
  // route in tests/int/localapi-rest-parity.int.spec.ts (an anonymous
  // request gets a real 403), which is what caught this handler's original
  // missing access check.
  it('POST /users/unlock denies an anonymous (unauthenticated) caller with 403, matching the reference engine default access.unlock', async () => {
    const engine = makeMockEngine() // default mock: auth() resolves { user: null }
    const res = await handleRestRequest(req('POST', 'http://x/api/users/unlock', { email: 'a@b.com' }), ['users', 'unlock'], engine)
    expect(res!.status).toBe(403)
  })
})

/* -------------------------------------------------------------------------- */
/* Generic error mapping                                                     */
/* -------------------------------------------------------------------------- */

describe('localapi/rest - error mapping', () => {
  it('maps Forbidden to 403 with {errors: [{name, message}]}', async () => {
    const engine = makeMockEngine({ find: vi.fn().mockRejectedValue(new Forbidden()) })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts'), ['posts'], engine)
    expect(res!.status).toBe(403)
    const body = (await res!.json()) as { errors: Array<{ name?: string; message: string }> }
    expect(body.errors[0].name).toBe('Forbidden')
  })

  it('maps operations.ts NotFound to 404', async () => {
    const engine = makeMockEngine({ update: vi.fn().mockRejectedValue(new OperationsNotFound()) })
    const res = await handleRestRequest(req('PATCH', 'http://x/api/posts/999', { title: 'x' }), ['posts', '999'], engine)
    expect(res!.status).toBe(404)
  })

  it('maps read-operations.ts NotFound to 404', async () => {
    const engine = makeMockEngine({ findByID: vi.fn().mockRejectedValue(new ReadNotFound()) })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/999'), ['posts', '999'], engine)
    expect(res!.status).toBe(404)
  })

  it('maps ValidationError to 400 with the field errors nested under data', async () => {
    const fieldErrors = [{ path: 'title', message: 'Required' }]
    const engine = makeMockEngine({ create: vi.fn().mockRejectedValue(new ValidationError(fieldErrors)) })
    const res = await handleRestRequest(req('POST', 'http://x/api/posts', {}), ['posts'], engine)
    expect(res!.status).toBe(400)
    const body = (await res!.json()) as { errors: Array<{ name?: string; message: string; data?: { errors: unknown } }> }
    expect(body.errors[0].name).toBe('ValidationError')
    expect(body.errors[0].data?.errors).toEqual(fieldErrors)
  })

  it('masks an unrecognized error to a generic 500 message', async () => {
    const engine = makeMockEngine({ find: vi.fn().mockRejectedValue(new Error('some internal secret detail')) })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts'), ['posts'], engine)
    expect(res!.status).toBe(500)
    const body = (await res!.json()) as { errors: Array<{ message: string }> }
    expect(body.errors[0].message).toBe('Something went wrong.')
  })
})

/* -------------------------------------------------------------------------- */
/* /api/access, /api/<collection>/access/:id?, /api/globals/<slug>/access    */
/*                                                                            */
/* Fixtures use real registry slugs whose real access functions this test    */
/* file can reason about directly (not mocked - the registry itself isn't    */
/* injectable, see this file's own header): `faqs` (`access.read: () => true`*/
/* unconditionally, `create`/`update`/`delete: isAdmin`, no field-level       */
/* access anywhere - a clean "collapses to `true`/omitted" fixture), and     */
/* `users` (`access.read`/`update: isAdminOrSelf` - returns a `Where` object */
/* for a non-admin matching self, `false` otherwise; `access.create`/        */
/* `delete: isAdmin`; the `roles` field has its own `access.update` -        */
/* admin-only - a fixture for field-level override + inheritance).          */
/* -------------------------------------------------------------------------- */

type AccessBody = Record<string, unknown>

describe('localapi/rest - GET /api/access (root)', () => {
  it('anonymous request: no canAccessAdmin, faqs.read true (unconditional), faqs create/update/delete absent', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/access'), ['access'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as AccessBody
    expect(body.canAccessAdmin).toBeUndefined()
    const faqs = (body.collections as AccessBody).faqs as AccessBody
    expect(faqs.read).toBe(true)
    expect(faqs.create).toBeUndefined()
    expect(faqs.update).toBeUndefined()
    expect(faqs.delete).toBeUndefined()
  })

  it('admin user: canAccessAdmin true, faqs fields collapse to true (no field-level access anywhere, all ops permitted)', async () => {
    const adminUser = { id: 1, collection: 'users', roles: ['admin'] }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/access'), ['access'], engine)
    const body = (await res!.json()) as AccessBody
    expect(body.canAccessAdmin).toBe(true)
    const faqs = (body.collections as AccessBody).faqs as AccessBody
    expect(faqs.create).toBe(true)
    expect(faqs.read).toBe(true)
    expect(faqs.update).toBe(true)
    expect(faqs.delete).toBe(true)
    expect(faqs.fields).toBe(true)
  })

  it('non-admin logged-in user from the users collection: canAccessAdmin true (isLoggedIn default, Users declares no access.admin)', async () => {
    const user = { id: 5, collection: 'users', roles: ['customer'] }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/access'), ['access'], engine)
    const body = (await res!.json()) as AccessBody
    expect(body.canAccessAdmin).toBe(true)
  })

  it('includes every registered collection and global slug', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/access'), ['access'], engine)
    const body = (await res!.json()) as AccessBody
    expect(Object.keys(body.collections as AccessBody)).toContain('faqs')
    expect(Object.keys(body.collections as AccessBody)).toContain('users')
    expect(Object.keys(body.globals as AccessBody).length).toBeGreaterThan(0)
  })
})

describe('localapi/rest - POST /api/<collection>/access/:id? (no id)', () => {
  it('faqs, anonymous: read true, create/update/delete absent', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/faqs/access'), ['faqs', 'access'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as AccessBody
    expect(body.read).toBe(true)
    expect(body.create).toBeUndefined()
  })

  it('users, non-admin logged-in (no id, so no doc to match self against): read/update resolve via isAdminOrSelf with no req.user match target -> false, create/delete false (isAdmin)', async () => {
    const user = { id: 5, collection: 'users', roles: ['customer'] }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/access'), ['users', 'access'], engine)
    const body = (await res!.json()) as AccessBody
    // isAdminOrSelf always returns `{id: {equals: user.id}}` for a non-admin
    // logged-in user regardless of an id being present - this module's own
    // documented simplification (see rest.ts's `/api/access` section header)
    // treats any Where-object result as permitted-with-where, matching real
    // The original engine's own root/no-id (`fetchData: false`) behavior exactly.
    expect(body.read).toEqual({ permission: true, where: { id: { equals: 5 } } })
    expect(body.update).toEqual({ permission: true, where: { id: { equals: 5 } } })
    expect(body.create).toBeUndefined()
    expect(body.delete).toBeUndefined()
  })
})

describe('localapi/rest - POST /api/<collection>/access/:id (with id)', () => {
  it('users/access/5, non-admin self (id 5): read/update permitted-with-where, field-level roles.update denied (admin-only fn) but roles.read inherits the parent\'s where-restricted read', async () => {
    const user = { id: 5, collection: 'users', roles: ['customer'] }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/access/5', {}), ['users', 'access', '5'], engine)
    expect(res).not.toBeNull()
    const body = (await res!.json()) as AccessBody
    expect(body.read).toEqual({ permission: true, where: { id: { equals: 5 } } })
    const fields = body.fields as AccessBody
    const roles = fields.roles as AccessBody
    // roles' own `access.update` is admin-only - denied for this non-admin user, so 'update' is absent.
    expect(roles.update).toBeUndefined()
    // roles declares no `access.read` - inherits the parent's own resolved 'read' result verbatim.
    expect(roles.read).toEqual({ permission: true, where: { id: { equals: 5 } } })
  })

  it('users/access/999, non-admin (id not self): read/update denied entirely (isAdminOrSelf returns a Where object even so - but a non-matching id still resolves permission=false at the entity level per this module\'s isAdmin-or-where semantics is not evaluated - the Where object itself is opaque to this module, so it is still treated as permitted-with-where, a known simplification)', async () => {
    const user = { id: 5, collection: 'users', roles: ['customer'] }
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/users/access/999', {}), ['users', 'access', '999'], engine)
    const body = (await res!.json()) as AccessBody
    // isAdminOrSelf doesn't know about the target id at all - it always
    // returns the SAME `{id: {equals: req.user.id}}` Where object regardless
    // of which doc is being checked, so this module's read here is identical
    // to the id-5 case above (a `Where`-object result is never evaluated
    // against the actual target doc - see this module's documented
    // simplification).
    expect(body.read).toEqual({ permission: true, where: { id: { equals: 5 } } })
  })

  it('returns null for a non-numeric id segment', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/users/access/not-a-number'), ['users', 'access', 'not-a-number'], engine)
    expect(res).toBeNull()
  })
})

describe('localapi/rest - POST /api/globals/<slug>/access', () => {
  it('site-settings, anonymous: no canAccessAdmin-equivalent concept at global level, resolves per the global\'s own access config', async () => {
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: null }), findGlobal: vi.fn().mockResolvedValue({ id: 1, siteName: 'Test' }) })
    const res = await handleRestRequest(req('POST', 'http://x/api/globals/site-settings/access'), ['globals', 'site-settings', 'access'], engine)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as AccessBody
    expect(body.fields).toBeDefined()
  })

  it('returns null for an unrecognized global slug', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('POST', 'http://x/api/globals/nonsense/access'), ['globals', 'nonsense', 'access'], engine)
    expect(res).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* /versions, /versions/:id (GET), /versions/:id (POST restore)               */
/* -------------------------------------------------------------------------- */

describe('versions endpoints (Stage 7)', () => {
  const adminUser = { id: 1, email: 'a@b.com', collection: 'users' }
  const VERSION_ROW = (id: number, parentId: number, updatedAt: string, extra: Record<string, unknown> = {}) => ({
    id,
    parentId,
    latest: id === 3,
    createdAt: updatedAt,
    updatedAt,
    versionCreatedAt: '2026-01-01T00:00:00.000Z',
    versionUpdatedAt: updatedAt,
    _status: 'draft',
    title: `v${id}`,
    ...extra,
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function spyRegistry() {
    const { versionsRegistry } = await import('@/localapi/registry')
    return versionsRegistry
  }

  it('GET /posts/versions: 403 for an anonymous caller (default readVersions = isLoggedIn)', async () => {
    const engine = makeMockEngine()
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/versions'), ['posts', 'versions'], engine)
    expect(res?.status).toBe(403)
  })

  it('GET /posts/versions?where[parent][equals]=7: shapes docs, sorts -updatedAt, paginates', async () => {
    const reg = await spyRegistry()
    const findAll = vi.spyOn(reg.posts, 'findAll').mockResolvedValue([VERSION_ROW(3, 7, '2026-03-01T00:00:00.000Z'), VERSION_ROW(2, 7, '2026-02-01T00:00:00.000Z'), VERSION_ROW(1, 7, '2026-01-15T00:00:00.000Z')])
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/versions?where[parent][equals]=7&limit=2'), ['posts', 'versions'], engine)
    expect(res?.status).toBe(200)
    const body = (await res!.json()) as { docs: Array<Record<string, any>>; totalDocs: number; totalPages: number; hasNextPage: boolean }
    expect(findAll).toHaveBeenCalledWith(7)
    expect(body.totalDocs).toBe(3)
    expect(body.totalPages).toBe(2)
    expect(body.hasNextPage).toBe(true)
    expect(body.docs.map((d) => d.id)).toEqual([3, 2])
    expect(body.docs[0]).toMatchObject({ id: 3, parent: 7, latest: true, version: { title: 'v3', _status: 'draft', createdAt: '2026-01-01T00:00:00.000Z' } })
    expect(body.docs[0].version.parentId).toBeUndefined()
  })

  it('GET /posts/versions with no parent filter scans every parent', async () => {
    const reg = await spyRegistry()
    const findAll = vi.spyOn(reg.posts, 'findAll').mockImplementation(async (pid) => [VERSION_ROW(pid * 10, pid, '2026-01-01T00:00:00.000Z')])
    const engine = makeMockEngine({
      auth: vi.fn().mockResolvedValue({ user: adminUser }),
      find: vi.fn().mockResolvedValue({ ...PAGINATED_DOCS, docs: [{ id: 1 }, { id: 2 }] }),
    })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/versions'), ['posts', 'versions'], engine)
    const body = (await res!.json()) as { docs: Array<Record<string, any>>; totalDocs: number; totalPages: number; hasNextPage: boolean }
    expect(findAll).toHaveBeenCalledTimes(2)
    expect(body.totalDocs).toBe(2)
  })

  it('GET /posts/versions: unsupported where operator is a 400', async () => {
    const reg = await spyRegistry()
    vi.spyOn(reg.posts, 'findAll').mockResolvedValue([VERSION_ROW(1, 7, '2026-01-01T00:00:00.000Z')])
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }) })
    const res = await handleRestRequest(req('GET', 'http://x/api/posts/versions?where[parent][equals]=7&where[version.title][like]=x'), ['posts', 'versions'], engine)
    expect(res?.status).toBe(400)
  })

  it('GET /posts/versions/:id returns the shaped version; 404 when missing', async () => {
    const reg = await spyRegistry()
    vi.spyOn(reg.posts, 'findByID').mockResolvedValueOnce(VERSION_ROW(2, 7, '2026-02-01T00:00:00.000Z')).mockResolvedValueOnce(null)
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }) })
    const ok = await handleRestRequest(req('GET', 'http://x/api/posts/versions/2'), ['posts', 'versions', '2'], engine)
    expect(ok?.status).toBe(200)
    expect(await ok!.json()).toMatchObject({ id: 2, parent: 7, version: { title: 'v2' } })
    const missing = await handleRestRequest(req('GET', 'http://x/api/posts/versions/99'), ['posts', 'versions', '99'], engine)
    expect(missing?.status).toBe(404)
  })

  it('POST /posts/versions/:id restores via engine.update on the PARENT (published by default, flat response + message)', async () => {
    const reg = await spyRegistry()
    vi.spyOn(reg.posts, 'findByID').mockResolvedValue(VERSION_ROW(2, 7, '2026-02-01T00:00:00.000Z'))
    const update = vi.fn().mockResolvedValue({ id: 7, title: 'v2', _status: 'published' })
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }), update })
    const res = await handleRestRequest(req('POST', 'http://x/api/posts/versions/2'), ['posts', 'versions', '2'], engine)
    expect(res?.status).toBe(200)
    expect(await res!.json()).toEqual({ id: 7, title: 'v2', _status: 'published', message: 'Restored successfully.' })
    const args = update.mock.calls[0][0]
    expect(args.collection).toBe('posts')
    expect(args.id).toBe(7)
    expect(args.draft).toBe(false)
    expect(args.data).toMatchObject({ title: 'v2', _status: 'published' })
    expect(args.data.createdAt).toBeUndefined()
    expect(args.data.parentId).toBeUndefined()
  })

  it('POST /posts/versions/:id?draft=true restores as a draft', async () => {
    const reg = await spyRegistry()
    vi.spyOn(reg.posts, 'findByID').mockResolvedValue(VERSION_ROW(2, 7, '2026-02-01T00:00:00.000Z'))
    const update = vi.fn().mockResolvedValue({ id: 7 })
    const engine = makeMockEngine({ auth: vi.fn().mockResolvedValue({ user: adminUser }), update })
    await handleRestRequest(req('POST', 'http://x/api/posts/versions/2?draft=true'), ['posts', 'versions', '2'], engine)
    expect(update.mock.calls[0][0]).toMatchObject({ draft: true, data: { _status: 'draft' } })
  })

  it('collections without versions fall through (null)', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/faqs/versions'), ['faqs', 'versions'], engine)).toBeNull()
    expect(await handleRestRequest(req('POST', 'http://x/api/faqs/versions/1'), ['faqs', 'versions', '1'], engine)).toBeNull()
  })
})
