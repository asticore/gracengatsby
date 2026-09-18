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
import { describe, expect, it, vi } from 'vitest'

import { Forbidden } from '@/localapi/access'
import { AuthenticationError, InvalidResetToken, LockedAuth } from '@/localapi/auth'
import type { Engine } from '@/localapi/engine'
import { NotFound as OperationsNotFound, ValidationError } from '@/localapi/operations'
import { NotFound as ReadNotFound } from '@/localapi/read-operations'
import { handleRestRequest } from '@/localapi/rest'

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

describe('localapi/rest - fallthrough to real Payload', () => {
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

  it('returns null for bulk PATCH (no id)', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('PATCH', 'http://x/api/posts'), ['posts'], engine)).toBeNull()
  })

  it('returns null for bulk DELETE (no id)', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('DELETE', 'http://x/api/posts'), ['posts'], engine)).toBeNull()
  })

  it('returns null for a non-numeric, non-route path segment', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/posts/not-a-number'), ['posts', 'not-a-number'], engine)).toBeNull()
  })

  it('returns null for versions sub-paths (deferred)', async () => {
    const engine = makeMockEngine()
    expect(await handleRestRequest(req('GET', 'http://x/api/posts/versions'), ['posts', 'versions'], engine)).toBeNull()
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
    expect(setCookie).toContain('payload-token=tok')
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
    expect(setCookie).toContain('payload-token=;')
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
    // A syntactically JWT-shaped token (header.payload.signature) so decodeJwtExpUnsafe can read `exp` back out.
    const payload = Buffer.from(JSON.stringify({ exp: 999 })).toString('base64url')
    const token = `header.${payload}.sig`
    const res = await handleRestRequest(req('GET', 'http://x/api/users/me', undefined, { Cookie: `payload-token=${token}` }), ['users', 'me'], engine)
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
    expect(res!.headers.get('Set-Cookie')).toContain('payload-token=newtok')
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
    expect(res!.headers.get('Set-Cookie')).toContain('payload-token=tok')
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

  // Real Payload's `users` collection has no explicit `access.unlock`, so its
  // sanitize step fills in `auth/defaultAccess.js`'s own default -
  // `({req:{user}}) => Boolean(user)` - ANY authenticated user, but never an
  // anonymous one. Confirmed empirically against real Payload's own REST
  // route in tests/int/localapi-rest-parity.int.spec.ts (an anonymous
  // request gets a real 403), which is what caught this handler's original
  // missing access check.
  it('POST /users/unlock denies an anonymous (unauthenticated) caller with 403, matching real Payload default access.unlock', async () => {
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
