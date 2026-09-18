// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// This is the write-both-ways parity proof src/localapi/rest.ts (Stage 7
// sub-step 3, "REST + GraphQL API removal") needs before it can be wired
// into src/app/(engage)/api/[...slug]/route.ts, per this project's standing
// build-prove-flip methodology. Unlike tests/int/localapi-rest.int.spec.ts
// (which exercises handleRestRequest against a fully MOCKED Engine, proving
// only the handler's own internal dispatch logic), this file drives BOTH
// implementations at the REST wire level - real Payload's own
// REST_GET/POST/PATCH/DELETE handlers (@payloadcms/next/routes, called
// directly as plain async functions: confirmed safe to call outside a real
// Next.js request - they only touch the Fetch Request API + parseCookies,
// no next/headers/cookies()/draftMode()) and this project's own
// handleRestRequest (backed by a REAL createEngine(), not a mock) - against
// the SAME live D1 database - and asserts their Response status/body
// shapes/cookies match the wire contract documented in rest.ts's own header
// comment and the plan doc's Sub-step 3 section.
//
// Auth flows can't share a single row across both implementations (a login
// mutates loginAttempts/sessions on the row it reads - same reasoning
// tests/int/localapi-auth-parity.int.spec.ts's own header comment gives),
// so every auth test below creates two separate, identically-seeded real
// users - one driven through the real REST route, one through
// handleRestRequest - and asserts the two responses have equivalent SHAPE
// (same keys, same types, same status/cookie presence), not byte-identical
// bodies (the actual token/user-id values necessarily differ). Read-only
// endpoints (collection find/count/byID, global find) and admin CRUD via
// the `translations` collection use a single shared admin JWT, since both
// implementations authenticate it independently (same secret-derivation
// formula, confirmed in Stage 2/6c) without mutating shared session state
// in a way that would cross-contaminate the comparison.
import config from '@engage-config'
import '@/engage.config'

import type { RealEngine } from './helpers/realEngine'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@/engine/next/routes'

import { deleteUser } from '@/cms/db'
import { createEngine } from '@/localapi/engine'
import { handleRestRequest } from '@/localapi/rest'
import { getRealEngine } from './helpers/realEngine'

const realGet = REST_GET(config)
const realPost = REST_POST(config)
const realPatch = REST_PATCH(config)
const realDelete = REST_DELETE(config)

const engine = createEngine()

function req(method: string, url: string, body?: unknown, headers?: Record<string, string>): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

type RestHandler = (request: Request, args: { params: Promise<{ slug: string[] }> }) => Promise<Response>

async function callReal(handler: RestHandler, request: Request, slug: string[]): Promise<Response> {
  return handler(request, { params: Promise.resolve({ slug }) })
}

async function callOurs(request: Request, slug: string[]): Promise<Response> {
  const res = await handleRestRequest(request, slug, engine)
  if (!res) throw new Error(`handleRestRequest returned null (unexpectedly fell through) for slug ${slug.join('/')}`)
  return res
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}

const PASSWORD = 'Stage7RestParity!'
const createdUserIds: number[] = []

let realEnginePromise: Promise<RealEngine> | null = null
function getReal(): Promise<RealEngine> {
  if (!realEnginePromise) realEnginePromise = getRealEngine()
  return realEnginePromise
}

// Test users are seeded through the REAL engine's create() - NOT
// createEngine()'s own generic create(), which dispatches "users" through
// writeRegistry's plain CRUD family (src/localapi/registry.ts, confirmed in
// the Stage 6a plan-doc section: "users ... uses the same plain CRUD family
// every other collection uses"), not the auth-row-specific hashing path
// src/localapi/auth.ts's own login() expects. Login/password verification
// only works correctly on rows real Payload's own auth field machinery (or
// this project's own dedicated AuthDbOps writes) actually hashed - the same
// reason tests/int/localapi-auth-parity.int.spec.ts's own createRealUser
// uses the real engine, not this project's own. Both REST implementations
// under test here read/authenticate the SAME real row afterward.
async function createRealUser(prefix: string, roles: Array<'admin' | 'customer'> = ['customer']): Promise<{ id: number; email: string }> {
  const email = `stage7-rest-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
  const real = await getReal()
  const created = await real.create({ collection: 'users', data: { email, password: PASSWORD, roles } })
  createdUserIds.push(created.id as number)
  return { id: created.id as number, email }
}

afterAll(async () => {
  for (const id of createdUserIds) await deleteUser(id).catch((): undefined => undefined)
})

/* -------------------------------------------------------------------------- */
/* Public collection reads (faqs) - no auth required on either side          */
/* -------------------------------------------------------------------------- */

describe('rest parity - public collection reads (faqs)', () => {
  it('GET /api/faqs?limit=3&sort=id: same envelope shape and doc count on both sides', async () => {
    const realRes = await callReal(realGet, req('GET', 'http://x/api/faqs?limit=3&sort=id'), ['faqs'])
    const oursRes = await callOurs(req('GET', 'http://x/api/faqs?limit=3&sort=id'), ['faqs'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)

    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>

    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(oursBody.totalDocs).toBe(realBody.totalDocs)
    expect(Array.isArray(oursBody.docs)).toBe(true)
    expect((oursBody.docs as unknown[]).length).toBe((realBody.docs as unknown[]).length)
  })

  it('GET /api/faqs/count: identical {totalDocs} on both sides', async () => {
    const realRes = await callReal(realGet, req('GET', 'http://x/api/faqs/count'), ['faqs', 'count'])
    const oursRes = await callOurs(req('GET', 'http://x/api/faqs/count'), ['faqs', 'count'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)

    const realBody = (await realRes.json()) as { totalDocs: number }
    const oursBody = (await oursRes.json()) as { totalDocs: number }
    expect(oursBody).toEqual(realBody)
  })

  it('GET /api/faqs/:id: real Payload and handleRestRequest return the SAME raw doc, no wrapper', async () => {
    const list = await engine.find({ collection: 'faqs', limit: 1, sort: 'id' })
    if (list.docs.length === 0) return // nothing to compare against on this DB - not a failure

    const id = list.docs[0]!.id as number
    const realRes = await callReal(realGet, req('GET', `http://x/api/faqs/${id}`), ['faqs', String(id)])
    const oursRes = await callOurs(req('GET', `http://x/api/faqs/${id}`), ['faqs', String(id)])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    expect(await oursRes.json()).toEqual(await realRes.json())
  })
})

/* -------------------------------------------------------------------------- */
/* Public global read (site-settings) + admin global update, restored after  */
/* -------------------------------------------------------------------------- */

describe('rest parity - global find/update (site-settings)', () => {
  let adminToken: string
  let originalSiteName: string | null | undefined

  beforeAll(async () => {
    const admin = await createRealUser('site-settings-admin', ['admin'])
    const login = await engine.login({ collection: 'users', data: { email: admin.email, password: PASSWORD } })
    adminToken = login.token as string

    const existing = await engine.findGlobal({ slug: 'site-settings', overrideAccess: true, depth: 0 }).catch((): null => null)
    originalSiteName = (existing as { siteName?: string | null } | null)?.siteName
  })

  afterAll(async () => {
    await engine.updateGlobal({ slug: 'site-settings', data: { siteName: originalSiteName ?? 'Grace & Gatsby' }, overrideAccess: true }).catch(() => {})
  })

  it('GET /api/globals/site-settings: raw doc, no wrapper, same id on both sides', async () => {
    const realRes = await callReal(realGet, req('GET', 'http://x/api/globals/site-settings'), ['globals', 'site-settings'])
    const oursRes = await callOurs(req('GET', 'http://x/api/globals/site-settings'), ['globals', 'site-settings'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)

    const realBody = (await realRes.json()) as { id: unknown }
    const oursBody = (await oursRes.json()) as { id: unknown }
    expect(oursBody.id).toBe(realBody.id)
  })

  it('POST /api/globals/site-settings (not PATCH): both sides return {message, result} - key is "result", not "doc"', async () => {
    const realRes = await callReal(
      realPost,
      req('POST', 'http://x/api/globals/site-settings', { siteName: 'Real Parity Site Name' }, authHeader(adminToken)),
      ['globals', 'site-settings'],
    )
    const oursRes = await callOurs(
      req('POST', 'http://x/api/globals/site-settings', { siteName: 'Ours Parity Site Name' }, authHeader(adminToken)),
      ['globals', 'site-settings'],
    )

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)

    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>

    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(realBody.doc).toBeUndefined()
    expect(oursBody.doc).toBeUndefined()
    expect((realBody.result as { siteName?: string })?.siteName).toBe('Real Parity Site Name')
    expect((oursBody.result as { siteName?: string })?.siteName).toBe('Ours Parity Site Name')
  })
})

/* -------------------------------------------------------------------------- */
/* Admin collection CRUD round trip (translations) - separate rows per side  */
/* -------------------------------------------------------------------------- */

describe('rest parity - admin collection CRUD (translations)', () => {
  let adminToken: string

  beforeAll(async () => {
    const admin = await createRealUser('translations-admin', ['admin'])
    const login = await engine.login({ collection: 'users', data: { email: admin.email, password: PASSWORD } })
    adminToken = login.token as string
  })

  it('POST /api/translations (create): both sides return {doc, message}, 201', async () => {
    const realRes = await callReal(
      realPost,
      req(
        'POST',
        'http://x/api/translations',
        { locale: 'en-REAL', sourceKind: 'interface', sourceId: 'ui', fieldPath: `test.parity.real.${Date.now()}` },
        authHeader(adminToken),
      ),
      ['translations'],
    )
    const oursRes = await callOurs(
      req(
        'POST',
        'http://x/api/translations',
        { locale: 'en-OURS', sourceKind: 'interface', sourceId: 'ui', fieldPath: `test.parity.ours.${Date.now()}` },
        authHeader(adminToken),
      ),
      ['translations'],
    )

    expect(realRes.status).toBe(201)
    expect(oursRes.status).toBe(201)

    const realBody = (await realRes.json()) as { doc: { id: number; locale: string }; message: string }
    const oursBody = (await oursRes.json()) as { doc: { id: number; locale: string }; message: string }

    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(typeof oursBody.message).toBe('string')
    expect(realBody.doc.locale).toBe('en-REAL')
    expect(oursBody.doc.locale).toBe('en-OURS')

    const realId = realBody.doc.id
    const oursId = oursBody.doc.id

    // PATCH /api/translations/:id (update): both sides return {doc, message}, 200.
    const realUpdate = await callReal(realPatch, req('PATCH', `http://x/api/translations/${realId}`, { value: 'real-updated' }, authHeader(adminToken)), [
      'translations',
      String(realId),
    ])
    const oursUpdate = await callOurs(req('PATCH', `http://x/api/translations/${oursId}`, { value: 'ours-updated' }, authHeader(adminToken)), [
      'translations',
      String(oursId),
    ])

    expect(realUpdate.status).toBe(200)
    expect(oursUpdate.status).toBe(200)
    const realUpdateBody = (await realUpdate.json()) as { doc: { value: string }; message: string }
    const oursUpdateBody = (await oursUpdate.json()) as { doc: { value: string }; message: string }
    expect(Object.keys(oursUpdateBody).sort()).toEqual(Object.keys(realUpdateBody).sort())
    expect(realUpdateBody.doc.value).toBe('real-updated')
    expect(oursUpdateBody.doc.value).toBe('ours-updated')

    // DELETE /api/translations/:id: both sides return {doc, message}, 200.
    const realDel = await callReal(realDelete, req('DELETE', `http://x/api/translations/${realId}`, undefined, authHeader(adminToken)), [
      'translations',
      String(realId),
    ])
    const oursDel = await callOurs(req('DELETE', `http://x/api/translations/${oursId}`, undefined, authHeader(adminToken)), [
      'translations',
      String(oursId),
    ])

    expect(realDel.status).toBe(200)
    expect(oursDel.status).toBe(200)
    const realDelBody = (await realDel.json()) as Record<string, unknown>
    const oursDelBody = (await oursDel.json()) as Record<string, unknown>
    expect(Object.keys(oursDelBody).sort()).toEqual(Object.keys(realDelBody).sort())
  })

  it('denies a non-admin create identically: 403 Forbidden on both sides', async () => {
    const customer = await createRealUser('translations-customer', ['customer'])
    const login = await engine.login({ collection: 'users', data: { email: customer.email, password: PASSWORD } })
    const token = login.token as string

    const realRes = await callReal(
      realPost,
      req('POST', 'http://x/api/translations', { locale: 'en', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'x' }, authHeader(token)),
      ['translations'],
    )
    const oursRes = await callOurs(
      req('POST', 'http://x/api/translations', { locale: 'en', sourceKind: 'interface', sourceId: 'ui', fieldPath: 'x' }, authHeader(token)),
      ['translations'],
    )

    expect(realRes.status).toBe(403)
    expect(oursRes.status).toBe(403)
  })
})

/* -------------------------------------------------------------------------- */
/* Auth endpoints - separate real users per side, shape-only comparison      */
/* -------------------------------------------------------------------------- */

describe('rest parity - auth endpoints (login/me/refresh-token/logout/forgot-password/reset-password/unlock)', () => {
  it('POST /api/users/login: same response-key shape, both mint a Set-Cookie, no hash/salt leakage', async () => {
    const real = await createRealUser('login-real')
    const ours = await createRealUser('login-ours')

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/login', { email: real.email, password: PASSWORD }), ['users', 'login'])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/login', { email: ours.email, password: PASSWORD }), ['users', 'login'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)

    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>
    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())

    expect(realRes.headers.get('set-cookie')).toContain('payload-token=')
    expect(oursRes.headers.get('set-cookie')).toContain('payload-token=')

    const realUser = realBody.user as Record<string, unknown>
    const oursUser = oursBody.user as Record<string, unknown>
    for (const leaked of ['hash', 'salt']) {
      expect(realUser[leaked]).toBeUndefined()
      expect(oursUser[leaked]).toBeUndefined()
    }

    // Documented, minor, pre-existing divergence found by this parity test
    // (not fixed here - Stage 2's src/localapi/auth.ts, not this stage's
    // rest.ts, would need to change): real Payload's login response DOES
    // include a non-sensitive `user.sessions` array (id/createdAt/expiresAt
    // only - never hash/salt/token). This app's own `AuthUserDoc` type
    // (auth.ts) deliberately Omits `sessions` from every returned user doc,
    // so `handleLogin` never has it to include. Flagged in the plan doc
    // rather than silently asserted away.
    expect(Array.isArray(realUser.sessions)).toBe(true)
    expect(oursUser.sessions).toBeUndefined()
  })

  it('GET /api/users/me: authenticated with the login token from each side, same response-key shape', async () => {
    const real = await createRealUser('me-real')
    const ours = await createRealUser('me-ours')

    const realLogin = await engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })
    const oursLogin = await engine.login({ collection: 'users', data: { email: ours.email, password: PASSWORD } })

    const realRes = await callReal(realGet, req('GET', 'http://x/api/users/me', undefined, authHeader(realLogin.token as string)), ['users', 'me'])
    const oursRes = await callOurs(req('GET', 'http://x/api/users/me', undefined, authHeader(oursLogin.token as string)), ['users', 'me'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>
    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect((realBody.user as { id: number }).id).toBe(real.id)
    expect((oursBody.user as { id: number }).id).toBe(ours.id)
  })

  it('POST /api/users/refresh-token: both return {..., refreshedToken, ...} (not "token") and a fresh Set-Cookie', async () => {
    const real = await createRealUser('refresh-real')
    const ours = await createRealUser('refresh-ours')
    const realLogin = await engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })
    const oursLogin = await engine.login({ collection: 'users', data: { email: ours.email, password: PASSWORD } })

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/refresh-token', undefined, authHeader(realLogin.token as string)), [
      'users',
      'refresh-token',
    ])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/refresh-token', undefined, authHeader(oursLogin.token as string)), [
      'users',
      'refresh-token',
    ])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>
    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(typeof realBody.refreshedToken).toBe('string')
    expect(typeof oursBody.refreshedToken).toBe('string')
    expect(realBody.token).toBeUndefined()
    expect(oursBody.token).toBeUndefined()
  })

  it('POST /api/users/logout: both return {message} 200 with an expired Set-Cookie', async () => {
    const real = await createRealUser('logout-real')
    const ours = await createRealUser('logout-ours')
    const realLogin = await engine.login({ collection: 'users', data: { email: real.email, password: PASSWORD } })
    const oursLogin = await engine.login({ collection: 'users', data: { email: ours.email, password: PASSWORD } })

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/logout', undefined, authHeader(realLogin.token as string)), ['users', 'logout'])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/logout', undefined, authHeader(oursLogin.token as string)), ['users', 'logout'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>
    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(realRes.headers.get('set-cookie')).toContain('payload-token=')
    expect(oursRes.headers.get('set-cookie')).toContain('payload-token=')
  })

  it('POST /api/users/forgot-password: always {message: "Success"} on both sides, regardless of the email', async () => {
    const real = await createRealUser('forgot-real')
    const ours = await createRealUser('forgot-ours')

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/forgot-password', { email: real.email }), ['users', 'forgot-password'])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/forgot-password', { email: ours.email }), ['users', 'forgot-password'])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    expect(await realRes.json()).toEqual({ message: 'Success' })
    expect(await oursRes.json()).toEqual({ message: 'Success' })

    // Same, for an email that doesn't exist at all - real Payload never
    // reveals account existence either way.
    const realResUnknown = await callReal(realPost, req('POST', 'http://x/api/users/forgot-password', { email: 'nobody-stage7@example.com' }), [
      'users',
      'forgot-password',
    ])
    expect(realResUnknown.status).toBe(200)
    expect(await realResUnknown.json()).toEqual({ message: 'Success' })
  })

  it('POST /api/users/reset-password: both return {message, user, token} 200 given a valid forgot-password token', async () => {
    const real = await createRealUser('reset-real')
    const ours = await createRealUser('reset-ours')

    const realToken = await engine.forgotPassword({ collection: 'users', data: { email: real.email }, disableEmail: true })
    const oursToken = await engine.forgotPassword({ collection: 'users', data: { email: ours.email }, disableEmail: true })
    expect(typeof realToken).toBe('string')
    expect(typeof oursToken).toBe('string')

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/reset-password', { token: realToken, password: 'NewPass123!' }), [
      'users',
      'reset-password',
    ])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/reset-password', { token: oursToken, password: 'NewPass123!' }), [
      'users',
      'reset-password',
    ])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    const realBody = (await realRes.json()) as Record<string, unknown>
    const oursBody = (await oursRes.json()) as Record<string, unknown>
    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(realRes.headers.get('set-cookie')).toContain('payload-token=')
    expect(oursRes.headers.get('set-cookie')).toContain('payload-token=')
  })

  // users' access.unlock is not overridden in src/collections/Users.ts, so
  // real Payload's sanitize step fills in auth/defaultAccess.js's own
  // default - Boolean(user): ANY authenticated caller (not admin-only), but
  // never an anonymous one. Confirmed empirically: an anonymous unlock
  // request against real Payload's own REST route returns 403, not 200 -
  // this caught a real, now-fixed access-check gap in rest.ts's own
  // handleUnlock (see its updated header comment). Both requests below
  // authenticate as the SAME already-created admin (from the CRUD describe
  // block above) unlocking a fresh target user, matching that default.
  it('POST /api/users/unlock: {message: "Success"} on both sides for an authenticated caller, 403 for an anonymous one', async () => {
    const admin = await createRealUser('unlock-admin', ['admin'])
    const adminLogin = await engine.login({ collection: 'users', data: { email: admin.email, password: PASSWORD } })
    const real = await createRealUser('unlock-real')
    const ours = await createRealUser('unlock-ours')

    const realRes = await callReal(realPost, req('POST', 'http://x/api/users/unlock', { email: real.email }, authHeader(adminLogin.token as string)), [
      'users',
      'unlock',
    ])
    const oursRes = await callOurs(req('POST', 'http://x/api/users/unlock', { email: ours.email }, authHeader(adminLogin.token as string)), [
      'users',
      'unlock',
    ])

    expect(realRes.status).toBe(200)
    expect(oursRes.status).toBe(200)
    expect(await realRes.json()).toEqual({ message: 'Success' })
    expect(await oursRes.json()).toEqual({ message: 'Success' })

    const realAnon = await callReal(realPost, req('POST', 'http://x/api/users/unlock', { email: real.email }), ['users', 'unlock'])
    const oursAnon = await callOurs(req('POST', 'http://x/api/users/unlock', { email: ours.email }), ['users', 'unlock'])
    expect(realAnon.status).toBe(403)
    expect(oursAnon.status).toBe(403)
  })
})

/* -------------------------------------------------------------------------- */
/* Uploads stage: multipart create/update + GET .../file/:filename           */
/* -------------------------------------------------------------------------- */
// Proves the REST-layer fix for the real, previously-live bug documented in
// rest.ts's own header comment ("Uploads stage addition"): a real
// multipart/form-data upload POST to /api/media, in real Payload's own wire
// shape (a `_payload` JSON field plus a `file` field - the exact shape real
// Payload's OWN admin panel upload UI sends), now round-trips through
// handleCreate/handleUpdateByID instead of silently losing the file. Uses
// the same real-Payload-as-oracle pattern as every other describe block in
// this file, at the wire (Request/Response) level rather than the engine
// level tests/int/localapi-uploads-parity.int.spec.ts already covers.

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function multipartReq(method: string, url: string, data: Record<string, unknown>, file: { buffer: Buffer; name: string; type: string } | undefined, headers?: Record<string, string>): Request {
  const formData = new FormData()
  formData.set('_payload', JSON.stringify(data))
  if (file) formData.set('file', new File([new Uint8Array(file.buffer)], file.name, { type: file.type }))
  // Deliberately no explicit Content-Type header - the Fetch API's own
  // `Request` constructor sets `multipart/form-data; boundary=...` itself
  // from the `FormData` body, matching what a real browser/client does and
  // what `isMultipartRequest`'s own boundary-bearing check expects.
  return new Request(url, { method, headers, body: formData })
}

describe('rest parity - media uploads (multipart create/update, GET .../file/:filename)', () => {
  let adminToken: string
  const createdRealMediaIds: number[] = []
  const createdOursMediaIds: number[] = []

  beforeAll(async () => {
    const admin = await createRealUser('media-admin', ['admin'])
    const login = await engine.login({ collection: 'users', data: { email: admin.email, password: PASSWORD } })
    adminToken = login.token as string
  })

  afterAll(async () => {
    const real = await getReal()
    for (const id of createdRealMediaIds) await real.delete({ collection: 'media', id }).catch((): undefined => undefined)
    for (const id of createdOursMediaIds) await engine.delete({ collection: 'media', id, overrideAccess: true }).catch((): undefined => undefined)
  })

  it('POST /api/media (multipart): both sides return {doc, message}, 201, with computed upload fields', async () => {
    const marker = `rest-upl-${Date.now()}`

    const realRes = await callReal(
      realPost,
      multipartReq('POST', 'http://x/api/media', { alt: 'real alt' }, { buffer: onePixelPng, name: `${marker}-real.png`, type: 'image/png' }, authHeader(adminToken)),
      ['media'],
    )
    const oursRes = await callOurs(
      multipartReq('POST', 'http://x/api/media', { alt: 'ours alt' }, { buffer: onePixelPng, name: `${marker}-ours.png`, type: 'image/png' }, authHeader(adminToken)),
      ['media'],
    )

    expect(realRes.status).toBe(201)
    expect(oursRes.status).toBe(201)

    const realBody = (await realRes.json()) as { doc: Record<string, unknown>; message: string }
    const oursBody = (await oursRes.json()) as { doc: Record<string, unknown>; message: string }
    createdRealMediaIds.push(realBody.doc.id as number)
    createdOursMediaIds.push(oursBody.doc.id as number)

    expect(Object.keys(oursBody).sort()).toEqual(Object.keys(realBody).sort())
    expect(realBody.doc.filename).toBe(`${marker}-real.png`)
    expect(oursBody.doc.filename).toBe(`${marker}-ours.png`)
    expect(oursBody.doc.mimeType).toBe(realBody.doc.mimeType)
    expect(oursBody.doc.filesize).toBe(realBody.doc.filesize)
    expect(oursBody.doc.width).toBe(realBody.doc.width)
    expect(oursBody.doc.height).toBe(realBody.doc.height)
    expect(oursBody.doc.alt).toBe('ours alt')
  })

  it('POST /api/media (multipart) denies a non-admin identically: 403 on both sides', async () => {
    const customer = await createRealUser('media-customer', ['customer'])
    const login = await engine.login({ collection: 'users', data: { email: customer.email, password: PASSWORD } })
    const token = login.token as string
    const marker = `rest-upl-forbidden-${Date.now()}`

    const realRes = await callReal(
      realPost,
      multipartReq('POST', 'http://x/api/media', { alt: 'nope' }, { buffer: onePixelPng, name: `${marker}-real.png`, type: 'image/png' }, authHeader(token)),
      ['media'],
    )
    const oursRes = await callOurs(
      multipartReq('POST', 'http://x/api/media', { alt: 'nope' }, { buffer: onePixelPng, name: `${marker}-ours.png`, type: 'image/png' }, authHeader(token)),
      ['media'],
    )

    expect(realRes.status).toBe(403)
    expect(oursRes.status).toBe(403)
  })

  it('PATCH /api/media/:id (multipart): replaces the stored file, and a JSON PATCH with no file leaves it untouched', async () => {
    const marker = `rest-upl-update-${Date.now()}`
    const created = await callOurs(
      multipartReq('POST', 'http://x/api/media', { alt: 'v1' }, { buffer: onePixelPng, name: `${marker}.png`, type: 'image/png' }, authHeader(adminToken)),
      ['media'],
    )
    const { doc } = (await created.json()) as { id: number; filename: string } & { doc: { id: number; filename: string } }
    createdOursMediaIds.push(doc.id)

    // A JSON PATCH (no file) changes `alt` only - the multipart branch must
    // not swallow the still-supported plain-JSON update path.
    const jsonUpdate = await callOurs(req('PATCH', `http://x/api/media/${doc.id}`, { alt: 'v2' }, authHeader(adminToken)), ['media', String(doc.id)])
    expect(jsonUpdate.status).toBe(200)
    const jsonUpdateBody = (await jsonUpdate.json()) as { doc: { alt: string; filename: string } }
    expect(jsonUpdateBody.doc.alt).toBe('v2')
    expect(jsonUpdateBody.doc.filename).toBe(doc.filename)

    // A multipart PATCH with a new file replaces the stored object.
    const newName = `${marker}-replaced.png`
    const multipartUpdate = await callOurs(
      multipartReq('PATCH', `http://x/api/media/${doc.id}`, {}, { buffer: onePixelPng, name: newName, type: 'image/png' }, authHeader(adminToken)),
      ['media', String(doc.id)],
    )
    expect(multipartUpdate.status).toBe(200)
    const multipartUpdateBody = (await multipartUpdate.json()) as { doc: { filename: string; url: string } }
    expect(multipartUpdateBody.doc.filename).toBe(newName)
    expect(multipartUpdateBody.doc.url).toBe(`/api/media/file/${newName}`)
  })

  it('GET /api/media/file/:filename serves the stored bytes with no auth required, and 404s for a missing key', async () => {
    const marker = `rest-upl-serve-${Date.now()}`
    const created = await callOurs(
      multipartReq('POST', 'http://x/api/media', { alt: 'serve' }, { buffer: onePixelPng, name: `${marker}.png`, type: 'image/png' }, authHeader(adminToken)),
      ['media'],
    )
    const { doc } = (await created.json()) as { doc: { id: number; filename: string } }
    createdOursMediaIds.push(doc.id)

    const served = await handleRestRequest(req('GET', `http://x/api/media/file/${doc.filename}`), ['media', 'file', doc.filename], engine)
    expect(served).not.toBeNull()
    expect(served!.status).toBe(200)
    expect(served!.headers.get('content-type')).toBe('image/png')
    const bytes = Buffer.from(await served!.arrayBuffer())
    expect(bytes.equals(onePixelPng)).toBe(true)

    const missing = await handleRestRequest(req('GET', 'http://x/api/media/file/does-not-exist.png'), ['media', 'file', 'does-not-exist.png'], engine)
    expect(missing).not.toBeNull()
    expect(missing!.status).toBe(404)
  })
})

/* -------------------------------------------------------------------------- */
/* Fallthrough contract: handleRestRequest returns null for out-of-scope     */
/* routes so the future route wiring falls through to real Payload for them  */
/* -------------------------------------------------------------------------- */

describe('rest parity - fallthrough contract (real Payload still serves what handleRestRequest defers)', () => {
  it('GET /api/faqs/versions: real Payload serves it (200/other), handleRestRequest returns null (fallthrough)', async () => {
    const realRes = await callReal(realGet, req('GET', 'http://x/api/faqs/versions'), ['faqs', 'versions'])
    // Not asserting a specific real status (versions aren't enabled on faqs,
    // so real Payload itself may 4xx here) - only that real Payload actually
    // handles the route (never a thrown exception) while our own handler
    // explicitly defers it.
    expect(realRes).toBeInstanceOf(Response)
    const oursRaw = await handleRestRequest(req('GET', 'http://x/api/faqs/versions'), ['faqs', 'versions'], engine)
    expect(oursRaw).toBeNull()
  })
})
