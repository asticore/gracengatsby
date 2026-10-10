// @vitest-environment node
// Route-level checks for the media admin endpoints: every route refuses a caller
// without media rights (403) before reading anything, and rejects bad input
// (400) before any work. Auth and the engine are mocked.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  context: null as null | Record<string, unknown>,
}))

vi.mock('@/admin/auth', () => ({
  getAdminContext: async () => state.context,
}))
vi.mock('@/lib/engine', () => ({ getEngine: vi.fn(async () => state.context?.engine) }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn(async () => ({ env: {} })) }))
vi.mock('@/localapi/storage', () => ({
  putMediaObject: vi.fn(async () => undefined),
  putOriginalIfMissing: vi.fn(async () => true),
  readMediaObject: vi.fn(async () => null),
  deleteMediaObject: vi.fn(async () => undefined),
}))

import { POST as optimisePost } from '@/app/(engage)/api/admin-media-optimise/route'
import { POST as replacePost } from '@/app/(engage)/api/admin-media-replace/[id]/route'
import { GET as foldersGet } from '@/app/(engage)/api/admin-media-folders/route'
import { POST as movePost } from '@/app/(engage)/api/admin-media-move/route'
import { GET as usageGet } from '@/app/(engage)/api/admin-media-usage/route'
import { GET as altGet, POST as altPost } from '@/app/(engage)/api/admin-media-alt/route'
import { GET as stockGet } from '@/app/(engage)/api/admin-media-stock/route'
import { POST as stockImportPost } from '@/app/(engage)/api/admin-media-stock-import/route'

const json = (body: unknown) => new Request('http://localhost/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const get = (path: string) => new Request(`http://localhost${path}`)

/** A context for a signed-in user whose role grants (or does not grant) media rights. */
function contextFor(opts: { isAdmin: boolean; allow: boolean }) {
  const engine = {
    find: vi.fn(async () => ({ docs: [] })),
    findByID: vi.fn(async () => null),
    findGlobal: vi.fn(async () => null),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: 1 })),
    config: { routes: { admin: '/admin' } },
  }
  return { engine, isAdmin: opts.isAdmin, can: () => opts.allow }
}

describe('media admin routes refuse callers without media rights', () => {
  beforeEach(() => {
    state.context = contextFor({ isAdmin: false, allow: false })
  })

  const cases: Array<[string, () => Promise<Response>]> = [
    ['optimise', () => optimisePost(json({ ids: [1] }))],
    ['replace', () => replacePost(new Request('http://localhost/api/x', { method: 'POST' }), { params: Promise.resolve({ id: '1' }) })],
    ['folders', () => foldersGet()],
    ['move', () => movePost(json({ ids: [1], folder: 'a' }))],
    ['usage', () => usageGet(get('/api/admin-media-usage?id=1'))],
    ['alt GET', () => altGet()],
    ['alt POST', () => altPost(json({ ids: [1], provider: 'claude' }))],
    ['stock search', () => stockGet(get('/api/admin-media-stock?provider=pexels&q=sea'))],
    ['stock import', () => stockImportPost(json({ provider: 'pexels', id: '1' }))],
  ]

  for (const [name, call] of cases) {
    it(`${name} answers 403 and reads nothing`, async () => {
      const response = await call()
      expect(response.status).toBe(403)
      const engine = state.context?.engine as { find: ReturnType<typeof vi.fn>; findGlobal: ReturnType<typeof vi.fn> }
      expect(engine.find).not.toHaveBeenCalled()
      expect(engine.findGlobal).not.toHaveBeenCalled()
    })
  }
})

describe('media admin routes validate input for an allowed caller', () => {
  beforeEach(() => {
    state.context = contextFor({ isAdmin: true, allow: true })
  })

  it('optimise: rejects an empty or non-numeric id list', async () => {
    expect((await optimisePost(json({ ids: [] }))).status).toBe(400)
    expect((await optimisePost(json({ ids: ['abc'] }))).status).toBe(400)
  })

  it('optimise: says so when optimisation is off', async () => {
    const response = await optimisePost(json({ ids: [1] }))
    expect(response.status).toBe(409)
  })

  it('move: refuses a folder that is not a folder name', async () => {
    const response = await movePost(json({ ids: [1], folder: '../../etc' }))
    expect(response.status).toBe(400)
    const engine = state.context?.engine as { update: ReturnType<typeof vi.fn> }
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('usage: needs an id', async () => {
    expect((await usageGet(get('/api/admin-media-usage?id=abc'))).status).toBe(400)
  })

  it('alt: needs a known provider and a list of pictures', async () => {
    expect((await altPost(json({ ids: [1], provider: 'bogus' }))).status).toBe(400)
    expect((await altPost(json({ ids: Array.from({ length: 26 }, (_, i) => i + 1), provider: 'claude' }))).status).toBe(400)
  })

  it('stock search: needs a known library and a real query', async () => {
    expect((await stockGet(get('/api/admin-media-stock?provider=flickr&q=sea'))).status).toBe(400)
    expect((await stockGet(get('/api/admin-media-stock?provider=pexels&q=a'))).status).toBe(400)
  })

  it('stock search with no query reports which libraries are available, never their keys', async () => {
    const response = await stockGet(get('/api/admin-media-stock'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { providers: Record<string, boolean> }
    expect(body.providers.openverse).toBe(true)
    expect(JSON.stringify(body)).not.toMatch(/key/i)
  })

  it('stock import: refuses an unknown library', async () => {
    expect((await stockImportPost(json({ provider: 'flickr', id: '1' }))).status).toBe(400)
  })

  it('replace: 404s a document that does not exist', async () => {
    const response = await replacePost(new Request('http://localhost/api/x', { method: 'POST' }), { params: Promise.resolve({ id: '99' }) })
    expect(response.status).toBe(404)
  })
})

describe('a caller with the media role but not admin is allowed through', () => {
  it('reaches the handler (not 403) when the role grants the action', async () => {
    state.context = contextFor({ isAdmin: false, allow: true })
    const response = await optimisePost(json({ ids: [1] }))
    expect(response.status).not.toBe(403)
  })
})

describe('review hardening at the route level', () => {
  beforeEach(() => {
    state.context = contextFor({ isAdmin: true, allow: true })
  })

  it('optimise: a request takes at most the batch size from settings, and never more than 25', async () => {
    const engine = state.context?.engine as { findGlobal: ReturnType<typeof vi.fn> }
    engine.findGlobal.mockResolvedValue({ optimisation: { provider: 'cloudflare-images' }, bulk: { batchSize: 3 } })
    const tooMany = await optimisePost(json({ ids: [1, 2, 3, 4] }))
    expect(tooMany.status).toBe(400)
    expect(await tooMany.json()).toMatchObject({ cap: 3 })

    engine.findGlobal.mockResolvedValue({ optimisation: { provider: 'cloudflare-images' }, bulk: { batchSize: 100 } })
    const capped = await optimisePost(json({ ids: Array.from({ length: 26 }, (_, i) => i + 1) }))
    expect(capped.status).toBe(400)
    expect(await capped.json()).toMatchObject({ cap: 25 })
  })

  it('alt: overwrite without confirmOverwrite is refused before any model is called', async () => {
    const response = await altPost(json({ ids: [1], provider: 'claude', overwrite: true }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/confirmOverwrite/) })
  })

  it('folders: reports whether the listing was cut short', async () => {
    const response = await foldersGet()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ folders: [], truncated: false })
  })

  it('stock import: stores the source address only when it is https', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('api.openverse.org')) {
        return new Response(JSON.stringify({ url: 'https://upload.wikimedia.org/w/file.jpg' }), { status: 200 })
      }
      return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const engine = state.context?.engine as { create: ReturnType<typeof vi.fn> }
      const hostile = await stockImportPost(json({ provider: 'openverse', id: 'abc', sourceUrl: 'javascript:alert(1)' }))
      expect(hostile.status).toBe(200)
      expect(engine.create.mock.calls[0]?.[0]).toMatchObject({ data: { sourceUrl: '' } })

      const safe = await stockImportPost(json({ provider: 'openverse', id: 'abc', sourceUrl: 'https://www.example.org/photo/1' }))
      expect(safe.status).toBe(200)
      expect(engine.create.mock.calls[1]?.[0]).toMatchObject({ data: { sourceUrl: 'https://www.example.org/photo/1' } })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
