// @vitest-environment node
// Blog builder route: auth, keys, spend cap, reply retry, streaming and the draft create.
// The AI client, keys and usage are mocked. No provider is ever called.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  readAiKey: vi.fn(),
  readBuilderSettings: vi.fn(),
  aiKeyAvailability: vi.fn(),
  readUsageSummary: vi.fn(),
  recordUsage: vi.fn(),
  callAiDetailed: vi.fn(),
  streamAiDetailed: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext: h.getAdminContext }))
vi.mock('@/features/ai/keys', () => ({
  readAiKey: h.readAiKey,
  readBuilderSettings: h.readBuilderSettings,
  aiKeyAvailability: h.aiKeyAvailability,
}))
vi.mock('@/features/ai/builderContext', () => ({ readSiteContext: vi.fn(async () => ({ siteName: 'Candle Co' })) }))
vi.mock('@/features/ai/builderUsage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/builderUsage')>()),
  readUsageSummary: h.readUsageSummary,
  recordUsage: h.recordUsage,
}))
vi.mock('@/features/ai/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/ai/client')>()),
  callAiDetailed: h.callAiDetailed,
  streamAiDetailed: h.streamAiDetailed,
}))
vi.mock('@/features/security/auditLog', () => ({ audit: h.audit, auditContext: () => ({}) }))
vi.mock('@/features/security/settings', () => ({ getSecuritySettings: vi.fn(async () => ({})) }))

import { GET, POST } from '@/app/(engage)/api/admin-blog-builder/route'

const usage = (over: Record<string, unknown> = {}) => ({ month: '2026-10', calls: 0, inputTokens: 0, outputTokens: 0, estCostUsd: 0, capUsd: 0, capReached: false, ...over })
const brief = { topic: 'Candle care', audience: 'New owners', tone: 'warm', length: 'short', keywords: 'wax, wick', callToAction: '' }

function engine() {
  return {
    find: vi.fn(async () => ({ docs: [] })),
    create: vi.fn(async () => ({ id: 9 })),
  }
}

function asAdmin(over: Record<string, unknown> = {}) {
  const e = engine()
  h.getAdminContext.mockResolvedValue({
    user: { id: 3, email: 'editor@example.test' },
    isAdmin: true,
    can: () => true,
    engine: e,
    ...over,
  })
  return e
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://site.test/api/admin-blog-builder', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

describe('admin-blog-builder route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.readBuilderSettings.mockResolvedValue({ models: { claude: 'claude-sonnet-4-5', openai: 'gpt-4o' }, capUsd: 0 })
    h.readUsageSummary.mockResolvedValue(usage())
    h.recordUsage.mockResolvedValue(undefined)
    h.audit.mockResolvedValue(undefined)
    h.readAiKey.mockImplementation(async (provider: string) => (provider === 'claude' ? 'sk-test' : null))
    h.aiKeyAvailability.mockResolvedValue({ claude: true, openai: false })
  })

  it('refuses a request with no signed-in user', async () => {
    h.getAdminContext.mockResolvedValue({ user: null, isAdmin: false, can: () => false })
    const response = await POST(post({ action: 'titles', brief }))
    expect(response.status).toBe(401)
  })

  it('refuses an editor who cannot create posts', async () => {
    h.getAdminContext.mockResolvedValue({ user: { id: 4 }, isAdmin: false, can: (resource: string, action: string) => resource === 'pages' && action === 'update' })
    const response = await POST(post({ action: 'titles', brief }))
    expect(response.status).toBe(403)
    expect(h.callAiDetailed).not.toHaveBeenCalled()
  })

  it('GET reports which keys exist and the spend, never a key', async () => {
    asAdmin()
    const response = await GET()
    const body = await response.json()
    expect(body).toMatchObject({ ok: true, providers: { claude: true, openai: false } })
    expect(JSON.stringify(body)).not.toContain('sk-test')
  })

  it('needs a provider key before any AI step', async () => {
    asAdmin()
    h.readAiKey.mockResolvedValue(null)
    const response = await POST(post({ action: 'titles', brief }))
    expect(response.status).toBe(400)
    expect(h.callAiDetailed).not.toHaveBeenCalled()
  })

  it('suggests titles from a mocked reply and records the call as blog usage', async () => {
    asAdmin()
    h.callAiDetailed.mockResolvedValue({ text: '{"titles": ["Caring for candles", "Wick care basics"]}', usage: { inputTokens: 120, outputTokens: 40 } })
    const response = await POST(post({ action: 'titles', brief }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, titles: ['Caring for candles', 'Wick care basics'], provider: 'claude', model: 'claude-sonnet-4-5' })
    const [args, options] = h.callAiDetailed.mock.calls[0]
    expect(args.provider).toBe('claude')
    expect(args.system).toContain('Candle Co')
    expect(args.messages[0].content).toContain('Candle care')
    expect(options.apiKey).toBe('sk-test')
    expect(h.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ mode: 'blog', provider: 'claude', ok: true, estimated: false }))
  })

  it('stops before calling the provider when the monthly cap is reached', async () => {
    asAdmin()
    h.readUsageSummary.mockResolvedValue(usage({ capUsd: 5, estCostUsd: 5.2, capReached: true }))
    const response = await POST(post({ action: 'titles', brief }))
    expect(response.status).toBe(429)
    expect((await response.json()).code).toBe('cap_reached')
    expect(h.callAiDetailed).not.toHaveBeenCalled()
  })

  it('retries once with the error fed back when the reply is not usable', async () => {
    asAdmin()
    h.callAiDetailed
      .mockResolvedValueOnce({ text: 'Sorry, here are some ideas.', usage: null })
      .mockResolvedValueOnce({ text: '{"titles": ["Fixed title"]}', usage: null })
    const response = await POST(post({ action: 'titles', brief }))
    expect(await response.json()).toMatchObject({ ok: true, titles: ['Fixed title'] })
    expect(h.callAiDetailed).toHaveBeenCalledTimes(2)
    expect(h.callAiDetailed.mock.calls[1][0].messages).toHaveLength(3)
  })

  it('streams progress and the result for a section when asked to', async () => {
    asAdmin()
    h.streamAiDetailed.mockImplementation(async (_args: unknown, _options: unknown, handlers: { onProgress?: (n: number) => void }) => {
      handlers.onProgress?.(12)
      return { text: 'A paragraph about wicks.', usage: { inputTokens: 50, outputTokens: 30 } }
    })
    const response = await POST(
      post(
        { action: 'section', brief, title: 'Candle care', outline: [{ heading: 'Wicks', notes: '' }], index: 0, sections: [] },
        { accept: 'text/event-stream, application/json' },
      ),
    )
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await response.text()
    expect(text).toContain('event: delta')
    expect(text).toContain('event: done')
    expect(text).toContain('"text":"A paragraph about wicks."')
    expect(text).toContain('"index":0')
  })

  it('creates a draft from the reviewed content and never publishes', async () => {
    const e = asAdmin()
    const response = await POST(
      post({
        action: 'create',
        title: 'Candle care',
        outline: [{ heading: 'Wicks', notes: '' }],
        sections: ['Trim wicks to 5 mm.'],
        meta: { metaTitle: 'Candle care', metaDescription: 'How to look after candles.', slug: 'Candle Care', tags: ['wax'], category: 'Guides' },
      }),
    )
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, id: '9', slug: 'candle-care', status: 'draft' })
    expect(h.callAiDetailed).not.toHaveBeenCalled()
    expect(e.create).toHaveBeenCalledTimes(1)
    const args = e.create.mock.calls[0][0] as { collection: string; draft: boolean; data: Record<string, unknown>; user: { id: number } }
    expect(args).toMatchObject({ collection: 'posts', draft: true, user: { id: 3 } })
    expect(args.data).toMatchObject({ title: 'Candle care', slug: 'candle-care' })
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'create' }), expect.anything())
  })

  it('refuses a create with a bad tag list before saving anything', async () => {
    const e = asAdmin()
    const response = await POST(
      post({
        action: 'create',
        title: 'Candle care',
        outline: [{ heading: 'Wicks', notes: '' }],
        sections: ['Text'],
        meta: { metaTitle: 'T', metaDescription: 'D', slug: 's', tags: 'wax', category: '' },
      }),
    )
    expect(response.status).toBe(400)
    expect(e.create).not.toHaveBeenCalled()
  })
})
