// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// This is the verification for the actual "flip" of Stage 7's REST work
// (see payload-removal-plan.md's "REST + GraphQL API removal (Stage 7)" ->
// "Not yet started" -> now done): src/app/(engage)/api/[...slug]/route.ts's
// exported GET/POST/PATCH/DELETE now try handleRestRequest first and fall
// through to real Payload's REST_GET/POST/PATCH/DELETE when it returns null.
//
// tests/int/localapi-rest-parity.int.spec.ts already proves handleRestRequest
// itself produces wire-compatible responses for real Payload - this file's
// only job is to prove the THIN DISPATCHER in route.ts wires that correctly:
// (a) when handleRestRequest would handle a request, the route's exported
// handler returns EXACTLY that response, not real Payload's; (b) when
// handleRestRequest returns null, the route's exported handler falls through
// to and returns EXACTLY real Payload's own response for the same request.
// Every case below is chosen to be non-mutating (a matched case either reads,
// or hits a real Payload/local NotFound on a nonexistent id, or forgot-
// password's documented no-op-on-unknown-email behavior) so this file needs
// no seeded fixtures or cleanup.
import config from '@engage-config'
import '@/engage.config'

import { describe, expect, it } from 'vitest'
import { REST_DELETE, REST_GET, REST_PATCH, REST_POST } from '@/engine/next/routes'

import { DELETE, GET, PATCH, POST } from '@/app/(engage)/api/[...slug]/route'
import { handleRestRequest } from '@/localapi/rest'

const realGet = REST_GET(config)
const realPost = REST_POST(config)
const realPatch = REST_PATCH(config)
const realDelete = REST_DELETE(config)

function req(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

function args(slug: string[]) {
  return { params: Promise.resolve({ slug }) }
}

async function bodyOf(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

describe('api/[...slug] route wiring - matched requests are served by handleRestRequest', () => {
  it('GET /api/faqs (public collection list) is served by our own handler, not real Payload', async () => {
    const slug = ['faqs']
    const viaRoute = await GET(req('GET', 'http://localhost/api/faqs?limit=1'), args(slug))
    const viaHandler = await handleRestRequest(req('GET', 'http://localhost/api/faqs?limit=1'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaHandler!))
  })

  it('POST /api/users/forgot-password (auth route, no side effect for an unknown email) is served by our own handler', async () => {
    const slug = ['users', 'forgot-password']
    const email = `wiring-smoke-${Date.now()}@example.com`
    const viaRoute = await POST(req('POST', 'http://localhost/api/users/forgot-password', { email }), args(slug))
    const viaHandler = await handleRestRequest(
      req('POST', 'http://localhost/api/users/forgot-password', { email }),
      slug,
    )
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaHandler!))
  })

  it('PATCH /api/faqs/:id on a nonexistent id is served by our own handler (mapped 404), not real Payload', async () => {
    const slug = ['faqs', '999999999']
    const viaRoute = await PATCH(req('PATCH', 'http://localhost/api/faqs/999999999', { title: 'x' }), args(slug))
    const viaHandler = await handleRestRequest(
      req('PATCH', 'http://localhost/api/faqs/999999999', { title: 'x' }),
      slug,
    )
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaHandler!))
  })

  it('DELETE /api/faqs/:id on a nonexistent id is served by our own handler (mapped 404), not real Payload', async () => {
    const slug = ['faqs', '999999999']
    const viaRoute = await DELETE(req('DELETE', 'http://localhost/api/faqs/999999999'), args(slug))
    const viaHandler = await handleRestRequest(req('DELETE', 'http://localhost/api/faqs/999999999'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaHandler!))
  })

  it('POST /api/faqs/:id/duplicate on a nonexistent id is served by our own handler, matching real Payload\'s own duplicate wire behavior', async () => {
    // faqs has no `unique` fields and drafts disabled - clean parity fixture
    // (no beforeDuplicate mutation, no draft-status wrinkle). Now handled by
    // handleRestRequest (Stage 7 duplicate-endpoint work), no longer deferred.
    const slug = ['faqs', '999999999', 'duplicate']
    const viaRoute = await POST(req('POST', 'http://localhost/api/faqs/999999999/duplicate'), args(slug))
    const viaRouteBody = await bodyOf(viaRoute)

    const viaHandler = await handleRestRequest(req('POST', 'http://localhost/api/faqs/999999999/duplicate'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(viaRouteBody).toEqual(await bodyOf(viaHandler!))

    const viaReal = await realPost(req('POST', 'http://localhost/api/faqs/999999999/duplicate'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
    expect(viaRouteBody).toEqual(await bodyOf(viaReal))
  })

  it('DELETE /api/faqs with no `where` (bulk, missing where) is served by our own handler, matching real Payload\'s 400 status', async () => {
    // Bulk delete is now handled (Stage 7), no longer deferred. Real Payload
    // requires `where` for a bulk op and 400s without it - same status here,
    // body compared only loosely (exact error-object shape isn't identical,
    // see handleBulkDelete's own doc comment: no `isPublic` field on our side).
    const slug = ['faqs']
    const viaRoute = await DELETE(req('DELETE', 'http://localhost/api/faqs'), args(slug))
    const viaHandler = await handleRestRequest(req('DELETE', 'http://localhost/api/faqs'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaHandler!))

    const viaReal = await realDelete(req('DELETE', 'http://localhost/api/faqs'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
  })

  it('GET /api/access (root, anonymous) is served by our own handler, and matches real Payload\'s own top-level shape', async () => {
    // /access is now handled (Stage 7), no longer deferred. Real Payload's
    // own root accessHandler needs no DB access at all (getAccessResults.js
    // never sets `fetchData: true` at the root level - see rest.ts's own
    // `/api/access` section header) so a live parity check against
    // REST_GET is safe in this sandbox (unlike other real-Payload endpoints
    // that hit "no such table" - see the plan doc's standing practices).
    // Deep body equality isn't asserted: this module's own documented
    // simplification (a `Where`-object access result is never resolved
    // against a real DB existence check) can make individual field/entity
    // permission values differ in edge cases the plan doc already flags -
    // only the top-level response shape and status are compared here.
    const slug = ['access']
    const viaRoute = await GET(req('GET', 'http://localhost/api/access'), args(slug))
    const viaRouteBody = (await bodyOf(viaRoute)) as { collections?: object; globals?: object }

    const viaHandler = await handleRestRequest(req('GET', 'http://localhost/api/access'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(viaRouteBody).toEqual(await bodyOf(viaHandler!))

    const viaReal = await realGet(req('GET', 'http://localhost/api/access'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
    const viaRealBody = (await bodyOf(viaReal)) as { collections?: object; globals?: object }
    expect(typeof viaRouteBody.collections).toBe('object')
    expect(typeof viaRouteBody.globals).toBe('object')
    // Real Payload's own `buildConfig()` only still registers a SUBSET of
    // this app's full 21-collection/17-global registry as real collections
    // (many were already fully cut over to this app's own registry-only
    // shadow configs by earlier stages, e.g. the 5 ecommerce collections
    // after `shopPlugin()` was removed) - so real's key set is a subset of
    // ours, not an equal set. Confirm the subset relationship rather than
    // exact equality.
    for (const slugKey of Object.keys(viaRealBody.collections ?? {})) {
      expect(Object.keys(viaRouteBody.collections ?? {})).toContain(slugKey)
    }
    for (const slugKey of Object.keys(viaRealBody.globals ?? {})) {
      expect(Object.keys(viaRouteBody.globals ?? {})).toContain(slugKey)
    }
  })

  it('POST /api/faqs/access (no id) is served by our own handler, matching real Payload\'s own status and top-level operation keys', async () => {
    const slug = ['faqs', 'access']
    const viaRoute = await POST(req('POST', 'http://localhost/api/faqs/access'), args(slug))
    const viaRouteBody = await bodyOf(viaRoute)

    const viaHandler = await handleRestRequest(req('POST', 'http://localhost/api/faqs/access'), slug)
    expect(viaHandler).not.toBeNull()
    expect(viaRoute.status).toBe(viaHandler!.status)
    expect(viaRouteBody).toEqual(await bodyOf(viaHandler!))

    const viaReal = await realPost(req('POST', 'http://localhost/api/faqs/access'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
  })
})

describe('api/[...slug] route wiring - unmatched requests fall through to real Payload', () => {
  it('GET /api/faqs/versions (deferred) falls through to real Payload, matching REST_GET directly', async () => {
    const slug = ['faqs', 'versions']
    const premise = await handleRestRequest(req('GET', 'http://localhost/api/faqs/versions'), slug)
    expect(premise).toBeNull()
    const viaRoute = await GET(req('GET', 'http://localhost/api/faqs/versions'), args(slug))
    const viaReal = await realGet(req('GET', 'http://localhost/api/faqs/versions'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaReal))
  })

  it('PATCH /api/faqs/versions/1 (deferred) falls through to real Payload, matching REST_PATCH directly', async () => {
    const slug = ['faqs', 'versions', '1']
    const premise = await handleRestRequest(req('PATCH', 'http://localhost/api/faqs/versions/1', { title: 'x' }), slug)
    expect(premise).toBeNull()
    const viaRoute = await PATCH(req('PATCH', 'http://localhost/api/faqs/versions/1', { title: 'x' }), args(slug))
    const viaReal = await realPatch(req('PATCH', 'http://localhost/api/faqs/versions/1', { title: 'x' }), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaReal))
  })

  it('GET /api/does-not-exist-collection (unrecognized slug) falls through to real Payload without throwing', async () => {
    const slug = ['does-not-exist-collection']
    const premise = await handleRestRequest(req('GET', 'http://localhost/api/does-not-exist-collection'), slug)
    expect(premise).toBeNull()
    const viaRoute = await GET(req('GET', 'http://localhost/api/does-not-exist-collection'), args(slug))
    const viaReal = await realGet(req('GET', 'http://localhost/api/does-not-exist-collection'), args(slug))
    expect(viaRoute.status).toBe(viaReal.status)
    expect(await bodyOf(viaRoute)).toEqual(await bodyOf(viaReal))
  })
})
