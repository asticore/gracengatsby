// @vitest-environment node
/**
 * /api/admin-pagespeed with mocks: auth and permission gates, input validation, and that the URL sent to
 * Google is built from the document slug and the site origin, never from the request body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext, getCloudflareContext, drizzle } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  getCloudflareContext: vi.fn(),
  drizzle: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))
vi.mock('drizzle-orm/d1', () => ({ drizzle }))

import { GET, POST } from '@/app/(engage)/api/admin-pagespeed/route'

const FIXTURE = { lighthouseResult: { categories: { performance: { score: 0.9 }, seo: { score: 1 } }, audits: {} } }

const fakeDb = () => ({
  run: vi.fn().mockResolvedValue(undefined),
  all: vi.fn(async (query: unknown) => {
    const text = JSON.stringify(query)
    return text.includes('last_insert_rowid') ? [{ id: 1 }] : []
  }),
})

const contextFor = (opts: { isAdmin?: boolean; can?: boolean; update?: boolean; doc?: Record<string, unknown> | null; user?: unknown } = {}) => ({
  isAdmin: opts.isAdmin ?? false,
  user: 'user' in opts ? opts.user : { id: 1 },
  can: vi.fn(() => opts.can ?? true),
  permissions: { collections: { posts: { read: true, update: opts.update ?? true }, pages: { read: true, update: true } } },
  engine: {
    findByID: vi.fn(async () => (opts.doc === undefined ? { id: 5, slug: 'hello', _status: 'published' } : opts.doc)),
    findGlobal: vi.fn(async () => ({})),
  },
})

const post = (body: unknown) => new Request('http://x/api/admin-pagespeed', { method: 'POST', body: JSON.stringify(body) })

describe('admin-pagespeed route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    getCloudflareContext.mockResolvedValue({ env: { D1: {} } })
    drizzle.mockReturnValue(fakeDb())
  })

  it('401 without a user, and without the PageSpeed permission', async () => {
    getAdminContext.mockResolvedValue(contextFor({ user: null }))
    expect((await GET(new Request('http://x/api/admin-pagespeed?collection=posts&id=5'))).status).toBe(401)
    expect((await POST(post({ collection: 'posts', id: 5, strategy: 'mobile' }))).status).toBe(401)
    getAdminContext.mockResolvedValue(contextFor({ can: false }))
    expect((await POST(post({ collection: 'posts', id: 5, strategy: 'mobile' }))).status).toBe(401)
  })

  it('needs update on the collection to run a test', async () => {
    getAdminContext.mockResolvedValue(contextFor({ update: false }))
    expect((await POST(post({ collection: 'posts', id: 5, strategy: 'mobile' }))).status).toBe(401)
  })

  it('validates collection, id and strategy', async () => {
    getAdminContext.mockResolvedValue(contextFor())
    expect((await POST(post({ collection: 'users', id: 5, strategy: 'mobile' }))).status).toBe(400)
    expect((await POST(post({ collection: 'posts', id: 'abc', strategy: 'mobile' }))).status).toBe(400)
    expect((await POST(post({ collection: 'posts', id: 5, strategy: 'tablet' }))).status).toBe(400)
    expect((await GET(new Request('http://x/api/admin-pagespeed?collection=media&id=5'))).status).toBe(400)
    expect((await GET(new Request('http://x/api/admin-pagespeed?collection=posts&id=0'))).status).toBe(400)
  })

  it('refuses to test a draft with a plain explanation', async () => {
    getAdminContext.mockResolvedValue(contextFor({ doc: { id: 5, slug: 'hello', _status: 'draft' } }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(post({ collection: 'posts', id: 5, strategy: 'mobile' }))
    expect(response.status).toBe(422)
    expect(((await response.json()) as { error: string }).error).toMatch(/draft/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tests the server-built URL and ignores any url in the body', async () => {
    getAdminContext.mockResolvedValue(contextFor())
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(post({ collection: 'posts', id: 5, strategy: 'desktop', url: 'http://169.254.169.254/latest', host: 'evil.test' }))
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const called = new URL(String(fetchMock.mock.calls[0][0]))
    expect(called.origin + called.pathname).toBe('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
    expect(called.searchParams.get('url')).toBe('https://gracengatsby.com/blog/hello')
    expect(called.searchParams.get('strategy')).toBe('desktop')
    const body = (await response.json()) as { result: { scores: { performance: number } } }
    expect(body.result.scores.performance).toBe(90)
  })

  it('passes a Google rate limit through as 429 with a friendly message', async () => {
    getAdminContext.mockResolvedValue(contextFor())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))
    const response = await POST(post({ collection: 'posts', id: 5, strategy: 'mobile' }))
    expect(response.status).toBe(429)
    expect(((await response.json()) as { error: string }).error).toMatch(/limiting/i)
  })

  it('GET reports testability and history', async () => {
    getAdminContext.mockResolvedValue(contextFor())
    const response = await GET(new Request('http://x/api/admin-pagespeed?collection=posts&id=5'))
    expect(response.status).toBe(200)
    const json = (await response.json()) as { testable: boolean; url: string; hasKey: boolean; results: { mobile: unknown[]; desktop: unknown[] } }
    expect(json.testable).toBe(true)
    expect(json.url).toBe('https://gracengatsby.com/blog/hello')
    expect(json.hasKey).toBe(false)
    expect(json.results).toEqual({ mobile: [], desktop: [] })
  })
})
