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

  it('POST /api/faqs/:id/duplicate (deferred) falls through to real Payload, matching REST_POST directly', async () => {
    const slug = ['faqs', '1', 'duplicate']
    const premise = await handleRestRequest(req('POST', 'http://localhost/api/faqs/1/duplicate'), slug)
    expect(premise).toBeNull()
    const viaRoute = await POST(req('POST', 'http://localhost/api/faqs/1/duplicate'), args(slug))
    const viaReal = await realPost(req('POST', 'http://localhost/api/faqs/1/duplicate'), args(slug))
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

  it('DELETE /api/faqs (bulk, no id, deferred) falls through to real Payload, matching REST_DELETE directly', async () => {
    const slug = ['faqs']
    const premise = await handleRestRequest(req('DELETE', 'http://localhost/api/faqs'), slug)
    expect(premise).toBeNull()
    const viaRoute = await DELETE(req('DELETE', 'http://localhost/api/faqs'), args(slug))
    const viaReal = await realDelete(req('DELETE', 'http://localhost/api/faqs'), args(slug))
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
