// Unit tests for src/localapi/endpoints.ts: custom collection `endpoints`
// dispatch (forms submit / form-submissions export), with a mocked engine.
import { describe, expect, it, vi } from 'vitest'

import type { Engine } from '@/localapi/engine'
import { handleCustomCollectionEndpoint } from '@/localapi/endpoints'
import { readRegistry } from '@/localapi/registry'

const makeEngine = (user: unknown = null): Engine =>
  ({
    auth: vi.fn().mockResolvedValue({ user }),
    findByID: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
  }) as unknown as Engine

describe('custom collection endpoints', () => {
  it('GET /form-submissions/export is a custom endpoint, not generic findByID (non-admin -> 404 body from endpoint)', async () => {
    const engine = makeEngine({ id: 1, roles: [] })
    const res = await handleCustomCollectionEndpoint(new Request('http://x/api/form-submissions/export?form=1'), ['form-submissions', 'export'], engine)
    expect(res?.status).toBe(404)
    expect(await res?.json()).toEqual({ error: 'Not found' })
    expect(engine.findByID).not.toHaveBeenCalled()
  })

  it('admin without ?form= gets the endpoint 400', async () => {
    const engine = makeEngine({ id: 1, roles: ['admin'] })
    const res = await handleCustomCollectionEndpoint(new Request('http://x/api/form-submissions/export'), ['form-submissions', 'export'], engine)
    expect(res?.status).toBe(400)
  })

  it('admin with unknown form gets endpoint 404 via engine.findByID on forms', async () => {
    const engine = makeEngine({ id: 1, roles: ['admin'] })
    const res = await handleCustomCollectionEndpoint(new Request('http://x/api/form-submissions/export?form=9'), ['form-submissions', 'export'], engine)
    expect(res?.status).toBe(404)
    expect(await res?.json()).toEqual({ error: 'That form does not exist.' })
    expect(engine.findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'forms', id: '9' }))
  })

  it('POST /forms/:id/submit is routed to the endpoint with routeParams, user, engine and query attached', async () => {
    const engine = makeEngine({ id: 5 })
    const endpoints = (readRegistry.collections.forms.config as unknown as { endpoints: Array<{ path: string; handler: (req: never) => unknown }> }).endpoints
    const submit = endpoints.find((e) => e.path === '/:id/submit')!
    const spy = vi.spyOn(submit, 'handler').mockResolvedValue(new Response('ok', { status: 201 }) as never)
    const res = await handleCustomCollectionEndpoint(new Request('http://x/api/forms/7/submit?a=b', { method: 'POST', body: '{}' }), ['forms', '7', 'submit'], engine)
    expect(res?.status).toBe(201)
    const req = spy.mock.calls[0][0] as unknown as { routeParams: unknown; user: unknown; engine: unknown; query: unknown }
    expect(req.routeParams).toEqual({ collection: 'forms', id: '7' })
    expect(req.user).toEqual({ id: 5 })
    expect(req.engine).toBe(engine)
    expect(req.query).toEqual({ a: 'b' })
    spy.mockRestore()
  })

  it('a throwing endpoint handler becomes a 500 JSON errors[] body', async () => {
    const engine = makeEngine()
    const endpoints = (readRegistry.collections.forms.config as unknown as { endpoints: Array<{ path: string; handler: (req: never) => unknown }> }).endpoints
    const submit = endpoints.find((e) => e.path === '/:id/submit')!
    const spy = vi.spyOn(submit, 'handler').mockRejectedValue(new Error('boom') as never)
    const res = await handleCustomCollectionEndpoint(new Request('http://x/api/forms/7/submit', { method: 'POST', body: '{}' }), ['forms', '7', 'submit'], engine)
    expect(res?.status).toBe(500)
    expect(await res?.json()).toEqual({ errors: [{ message: 'boom' }] })
    spy.mockRestore()
  })

  it('returns null for wrong method or a collection without endpoints', async () => {
    const engine = makeEngine()
    expect(await handleCustomCollectionEndpoint(new Request('http://x/api/forms/7/submit'), ['forms', '7', 'submit'], engine)).toBeNull()
    expect(await handleCustomCollectionEndpoint(new Request('http://x/api/posts/1'), ['posts', '1'], engine)).toBeNull()
    expect(await handleCustomCollectionEndpoint(new Request('http://x/api/nope/1'), ['nope', '1'], engine)).toBeNull()
  })
})
