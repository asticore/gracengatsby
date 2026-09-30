// Wiring test for src/app/(engage)/api/[...slug]/route.ts: the route is fully
// vendor-free, so it only has to (1) try custom collection endpoints first,
// (2) then the hand-written REST dispatcher, and (3) answer 404 for anything
// neither recognises. The two dispatchers themselves are covered by
// localapi-endpoints / localapi-rest specs; here they are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleCustomCollectionEndpoint, handleRestRequest } = vi.hoisted(() => ({
  handleCustomCollectionEndpoint: vi.fn(),
  handleRestRequest: vi.fn(),
}))

vi.mock('@/localapi/engine', () => ({ createEngine: () => ({ fake: true }) }))
vi.mock('@/localapi/endpoints', () => ({ handleCustomCollectionEndpoint }))
vi.mock('@/localapi/rest', () => ({ handleRestRequest }))

import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from '@/app/(engage)/api/[...slug]/route'

const args = (slug: string[]) => ({ params: Promise.resolve({ slug }) })

describe('api/[...slug] route wiring', () => {
  beforeEach(() => {
    handleCustomCollectionEndpoint.mockReset().mockResolvedValue(null)
    handleRestRequest.mockReset().mockResolvedValue(null)
  })

  it('serves a custom collection endpoint before the REST dispatcher', async () => {
    handleCustomCollectionEndpoint.mockResolvedValue(new Response('custom', { status: 201 }))
    const res = await GET(new Request('http://x/api/form-submissions/export'), args(['form-submissions', 'export']))
    expect(res.status).toBe(201)
    expect(handleRestRequest).not.toHaveBeenCalled()
  })

  it('falls to the REST dispatcher when no custom endpoint matches, passing one shared engine', async () => {
    handleRestRequest.mockResolvedValue(Response.json({ ok: true }))
    const res = await POST(new Request('http://x/api/faqs', { method: 'POST' }), args(['faqs']))
    expect(await res.json()).toEqual({ ok: true })
    const engineA = handleCustomCollectionEndpoint.mock.calls[0][2]
    const engineB = handleRestRequest.mock.calls[0][2]
    expect(engineA).toBe(engineB)
  })

  it.each([
    ['GET', GET],
    ['POST', POST],
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ])('%s of an unknown route is a 404 in the reference engine\'s wire format', async (_name, handler) => {
    const res = await handler(new Request('http://x/api/nope/1'), args(['nope', '1']))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ message: 'Route not found "/api/nope/1"' })
  })

  it('PUT has no routes (404) and OPTIONS answers 200 {}', async () => {
    const put = PUT(new Request('http://x/api/faqs/1', { method: 'PUT' }))
    expect(put.status).toBe(404)
    const options = OPTIONS()
    expect(options.status).toBe(200)
    expect(await options.json()).toEqual({})
  })
})
