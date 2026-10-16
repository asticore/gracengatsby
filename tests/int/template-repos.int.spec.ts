// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext, readSettings } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  readSettings: vi.fn(),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/templateRepos/settings', () => ({ readTemplateRepoSettings: readSettings }))

import {
  buildFileRequest,
  cleanRelativePath,
  clearTemplateRepoCache,
  isDeniedNodeType,
  listTemplates,
  loadManifest,
  loadPreviewImage,
  loadTemplateFile,
  normaliseSettings,
  parseManifest,
  parseTemplate,
  validateRepoConfig,
  LIMITS,
  type ManifestTemplate,
  type TemplateRepoConfig,
} from '@/features/templateRepos'
import { GET as listGET } from '@/app/(engage)/api/template-repos/route'
import { GET as templateGET } from '@/app/(engage)/api/template-repos/template/route'
import { GET as previewGET } from '@/app/(engage)/api/template-repos/preview/route'

const repo: TemplateRepoConfig = { label: 'Acme', owner: 'acme', repo: 'templates', branch: 'main', path: '', enabled: true }

const manifest = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  name: 'Acme templates',
  categories: [{ key: 'hero', label: 'Heroes' }],
  templates: [
    {
      slug: 'big-hero',
      title: 'Big hero',
      kind: 'section',
      category: 'hero',
      tags: ['hero'],
      preview: 'templates/big-hero/preview.png',
      file: 'templates/big-hero/template.json',
    },
  ],
  ...over,
})

const template = (over: Record<string, unknown> = {}) => ({
  format: 'engage-template',
  schemaVersion: 1,
  kind: 'section',
  tree: [{ type: 'heading', props: { text: 'Hello' } }],
  ...over,
})

const errorOf = (result: { ok: boolean; error?: string }): string => (result.ok ? '' : (result.error ?? ''))
const entryOf = (): ManifestTemplate => {
  const parsed = parseManifest(JSON.stringify(manifest()))
  if (!parsed.ok) throw new Error('fixture manifest is invalid')
  return parsed.value.templates[0]
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

describe('validators', () => {
  it('accepts a good manifest and template', () => {
    const m = parseManifest(JSON.stringify(manifest()))
    expect(m.ok).toBe(true)
    const t = parseTemplate(JSON.stringify(template()))
    expect(t.ok).toBe(true)
  })

  it('rejects malformed manifests', () => {
    const bad: unknown[] = [
      null,
      [],
      manifest({ schemaVersion: 2 }),
      manifest({ name: '' }),
      manifest({ categories: 'x' }),
      manifest({ templates: [{ ...manifest().templates[0], slug: 'Bad_Slug' }] }),
      manifest({ templates: [{ ...manifest().templates[0], slug: '../x' }] }),
      manifest({ templates: [{ ...manifest().templates[0], kind: 'layout' }] }),
      manifest({ templates: [{ ...manifest().templates[0], category: 'nope' }] }),
      manifest({ templates: [{ ...manifest().templates[0], file: 'templates/other/template.json' }] }),
      manifest({ templates: [{ ...manifest().templates[0], file: 'templates/big-hero/../../x.json' }] }),
      manifest({ templates: [{ ...manifest().templates[0], preview: '/etc/passwd' }] }),
      manifest({ templates: [{ ...manifest().templates[0], preview: 'templates/big-hero/preview.svg' }] }),
      manifest({ templates: [manifest().templates[0], manifest().templates[0]] }),
    ]
    for (const item of bad) expect(parseManifest(JSON.stringify(item)).ok, JSON.stringify(item)).toBe(false)
    expect(parseManifest('not json').ok).toBe(false)
  })

  it('enforces the manifest, template and count caps', () => {
    const many = Array.from({ length: LIMITS.maxTemplates + 1 }, (_, i) => ({
      ...manifest().templates[0],
      slug: `t${i}`,
      preview: `templates/t${i}/preview.png`,
      file: `templates/t${i}/template.json`,
    }))
    expect(parseManifest(JSON.stringify(manifest({ templates: many }))).ok).toBe(false)
    expect(parseManifest(JSON.stringify(manifest({ name: 'x'.repeat(LIMITS.manifestBytes) }))).ok).toBe(false)
    expect(parseTemplate(JSON.stringify(template({ tree: [{ type: 'text', text: 'x'.repeat(LIMITS.templateBytes) }] }))).ok).toBe(false)
  })

  it('rejects unsafe or malformed templates', () => {
    const bad: unknown[] = [
      template({ format: 'other' }),
      template({ schemaVersion: 2 }),
      template({ kind: 'x' }),
      template({ tree: [] }),
      template({ tree: [{ props: {} }] }),
      template({ tree: [{ type: 'html', props: { html: '<b>x</b>' } }] }),
      template({ tree: [{ type: 'Raw-HTML' }] }),
      template({ tree: [{ type: 'section', children: [{ type: 'script' }] }] }),
      template({ tree: [{ type: 'text', props: { value: '<script>alert(1)</script>' } }] }),
      template({ tree: [{ type: 'button', props: { href: 'javascript:alert(1)' } }] }),
      template({ tree: [{ type: 'text', props: { dangerouslySetInnerHTML: 'x' } }] }),
      template({ tree: [{ type: 'text', props: { inner: { elementType: 'iframe' } } }] }),
      template({ assets: [{ url: 'http://insecure.example/x.png' }] }),
      template({ requires: [] }),
    ]
    for (const item of bad) expect(parseTemplate(JSON.stringify(item)).ok, JSON.stringify(item)).toBe(false)
    expect(isDeniedNodeType('custom_code')).toBe(true)
    expect(isDeniedNodeType('heading')).toBe(false)
  })

  it('limits tree depth', () => {
    let node: Record<string, unknown> = { type: 'text' }
    for (let i = 0; i < LIMITS.maxTreeDepth + 2; i += 1) node = { type: 'section', children: [node] }
    expect(parseTemplate(JSON.stringify(template({ tree: [node] }))).ok).toBe(false)
  })

  it('validates repository rows', () => {
    expect(validateRepoConfig({ owner: 'acme', repo: 'templates' })).toMatchObject({ ok: true, value: { branch: 'main', path: '', enabled: true } })
    for (const row of [
      { owner: 'a/b', repo: 'x' },
      { owner: 'acme', repo: '..' },
      { owner: 'acme', repo: 'x', branch: '../main' },
      { owner: 'acme', repo: 'x', branch: 'a b' },
      { owner: 'acme', repo: 'x', path: '../secret' },
      { owner: 'acme', repo: 'x', path: 'a//b' },
      { owner: 'acme', repo: 'x', path: 'a\\b' },
      { owner: '', repo: 'x' },
    ]) {
      expect(validateRepoConfig(row).ok, JSON.stringify(row)).toBe(false)
    }
    expect(cleanRelativePath('/site/templates/')).toBe('site/templates')
    expect(cleanRelativePath('a/%2e%2e/b')).toBeNull()
  })

  it('normalises settings and reports bad rows without fetching them', () => {
    const settings = normaliseSettings({
      enabled: true,
      token: ' tok ',
      repos: [{ owner: 'acme', repo: 'templates' }, { owner: 'bad owner', repo: 'x', label: 'Broken' }, { owner: 'acme', repo: 'off', enabled: false }],
    })
    expect(settings.token).toBe('tok')
    expect(settings.repos.map((r) => !!r.config)).toEqual([true, false, true])
    expect(settings.repos[1].error).toBeTruthy()
  })
})

describe('URL builder', () => {
  it('builds raw.githubusercontent URLs for public repos', () => {
    const req = buildFileRequest({ ...repo, path: 'site/tpl', branch: 'release/v1' }, 'templates/big-hero/template.json', null)
    expect(req?.url).toBe('https://raw.githubusercontent.com/acme/templates/release/v1/site/tpl/templates/big-hero/template.json')
    expect(req?.headers.Authorization).toBeUndefined()
  })

  it('builds api.github.com contents URLs when a token is set', () => {
    const req = buildFileRequest(repo, 'manifest.json', 'secret')
    expect(req?.url).toBe('https://api.github.com/repos/acme/templates/contents/manifest.json?ref=main')
    expect(req?.headers.Authorization).toBe('Bearer secret')
  })

  it('refuses traversal and unsafe parts', () => {
    expect(buildFileRequest(repo, '../etc/passwd', null)).toBeNull()
    expect(buildFileRequest(repo, 'templates/../../x', null)).toBeNull()
    expect(buildFileRequest(repo, '/abs', null)).toBeNull()
    expect(buildFileRequest(repo, 'a\\b', null)).toBeNull()
    expect(buildFileRequest({ ...repo, path: '../x' }, 'manifest.json', null)).toBeNull()
    expect(buildFileRequest({ ...repo, branch: 'a/../b' }, 'manifest.json', null)).toBeNull()
    expect(buildFileRequest({ ...repo, owner: 'evil.com/x' }, 'manifest.json', null)).toBeNull()
    expect(buildFileRequest({ ...repo, owner: 'a@evil' }, 'manifest.json', null)).toBeNull()
  })
})

describe('fetching with a mocked fetch', () => {
  beforeEach(() => clearTemplateRepoCache())

  const text = (body: unknown, init: ResponseInit = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), init)

  it('loads and caches a manifest for five minutes', async () => {
    const fetchImpl = vi.fn(async () => text(manifest()))
    let clock = 1_000
    const deps = { fetchImpl, now: () => clock }
    expect((await loadManifest(repo, null, deps)).ok).toBe(true)
    expect((await loadManifest(repo, null, deps)).ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += LIMITS.cacheTtlMs + 1
    await loadManifest(repo, null, deps)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const init = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init[1].redirect).toBe('error')
  })

  it('turns failures into plain messages', async () => {
    const notFound = await loadManifest(repo, null, { fetchImpl: async () => text('x', { status: 404 }) })
    expect(notFound).toMatchObject({ ok: false })
    expect(errorOf(notFound)).toMatch(/could not find/i)
    clearTemplateRepoCache()
    const down = await loadManifest(repo, null, {
      fetchImpl: async () => {
        throw new Error('boom https://secret')
      },
    })
    expect(errorOf(down)).not.toMatch(/secret/)
  })

  it('refuses an oversized body', async () => {
    const big = 'x'.repeat(LIMITS.manifestBytes + 10)
    const result = await loadManifest(repo, null, { fetchImpl: async () => text(big) })
    expect(result.ok).toBe(false)
  })

  it('times out', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        })
      const pending = loadManifest(repo, null, { fetchImpl })
      await vi.advanceTimersByTimeAsync(LIMITS.fetchTimeoutMs + 10)
      const result = await pending
      expect(errorOf(result)).toMatch(/too long/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads a template and checks its kind against the manifest', async () => {
    const entry = entryOf()
    const ok = await loadTemplateFile(repo, entry, null, { fetchImpl: async () => text(template()) })
    expect(ok.ok).toBe(true)
    clearTemplateRepoCache()
    const mismatch = await loadTemplateFile(repo, entry, null, { fetchImpl: async () => text(template({ kind: 'page' })) })
    expect(mismatch.ok).toBe(false)
  })

  it('only passes through real png, jpeg or webp previews up to 2 MB', async () => {
    const entry = entryOf()
    const good = await loadPreviewImage(repo, entry, null, {
      fetchImpl: async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }),
    })
    expect(good).toMatchObject({ ok: true, value: { contentType: 'image/png' } })
    const wrongType = await loadPreviewImage(repo, entry, null, {
      fetchImpl: async () => new Response(PNG, { headers: { 'content-type': 'text/html' } }),
    })
    expect(wrongType.ok).toBe(false)
    const fake = await loadPreviewImage(repo, entry, null, {
      fetchImpl: async () => new Response('<html>', { headers: { 'content-type': 'image/png' } }),
    })
    expect(fake.ok).toBe(false)
    const huge = new Uint8Array(LIMITS.previewBytes + 1)
    huge.set(PNG)
    const tooBig = await loadPreviewImage(repo, entry, null, {
      fetchImpl: async () => new Response(huge, { headers: { 'content-type': 'image/png' } }),
    })
    expect(tooBig.ok).toBe(false)
  })

  it('merges templates from several repositories and keeps per-repository errors', async () => {
    const settings = normaliseSettings({
      enabled: true,
      repos: [
        { owner: 'acme', repo: 'one', label: 'One' },
        { owner: 'acme', repo: 'two', label: 'Two' },
        { owner: 'bad owner', repo: 'x', label: 'Three' },
      ],
    })
    const fetchImpl = async (url: string) => (url.includes('/one/') ? text(manifest()) : text('', { status: 404 }))
    const result = await listTemplates(settings, { fetchImpl })
    expect(result.templates).toEqual([
      expect.objectContaining({ repoIndex: 0, repoLabel: 'One', slug: 'big-hero', previewUrl: '/api/template-repos/preview?repo=0&slug=big-hero', categoryLabel: 'Heroes' }),
    ])
    expect(result.errors.map((e) => e.repoIndex)).toEqual([1, 2])
    expect((await listTemplates({ ...settings, enabled: false }, { fetchImpl })).templates).toEqual([])
  })
})

describe('routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearTemplateRepoCache()
  })

  const asUser = (roles: string[] | null) =>
    getAdminContext.mockResolvedValue({ user: roles ? { roles } : null, isAdmin: roles?.includes('admin') ?? false })

  it('refuses signed-out visitors and non-editor roles on every route', async () => {
    for (const handler of [listGET, templateGET, previewGET]) {
      asUser(null)
      expect((await handler(new Request('http://x/api/template-repos?repo=0&slug=a'))).status).toBe(401)
      asUser(['customer'])
      expect((await handler(new Request('http://x/api/template-repos?repo=0&slug=a'))).status).toBe(403)
      asUser(['viewer'])
      expect((await handler(new Request('http://x/api/template-repos?repo=0&slug=a'))).status).toBe(403)
    }
    expect(readSettings).not.toHaveBeenCalled()
  })

  it('lets editors list templates', async () => {
    asUser(['editor'])
    readSettings.mockResolvedValue(normaliseSettings({ enabled: true, repos: [{ owner: 'acme', repo: 'templates' }] }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest()))))
    try {
      const response = await listGET()
      expect(response.status).toBe(200)
      const body = (await response.json()) as { templates: unknown[] }
      expect(body.templates).toHaveLength(1)
      expect(JSON.stringify(body)).not.toMatch(/githubusercontent/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('validates query values and serves the template and preview', async () => {
    asUser(['admin'])
    readSettings.mockResolvedValue(normaliseSettings({ enabled: true, repos: [{ owner: 'acme', repo: 'templates' }] }))
    expect((await templateGET(new Request('http://x/api/template-repos/template?repo=0&slug=../x'))).status).toBe(400)
    expect((await templateGET(new Request('http://x/api/template-repos/template?repo=9&slug=big-hero'))).status).toBe(404)
    expect((await templateGET(new Request('http://x/api/template-repos/template?repo=abc&slug=big-hero'))).status).toBe(404)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest()))
        if (url.endsWith('template.json')) return new Response(JSON.stringify(template()))
        return new Response(PNG, { headers: { 'content-type': 'image/png' } })
      }),
    )
    try {
      const t = await templateGET(new Request('http://x/api/template-repos/template?repo=0&slug=big-hero'))
      expect(t.status).toBe(200)
      expect(((await t.json()) as { template: { tree: unknown[] } }).template.tree).toHaveLength(1)
      expect((await templateGET(new Request('http://x/api/template-repos/template?repo=0&slug=missing'))).status).toBe(502)

      const p = await previewGET(new Request('http://x/api/template-repos/preview?repo=0&slug=big-hero'))
      expect(p.status).toBe(200)
      expect(p.headers.get('content-type')).toBe('image/png')
      expect(p.headers.get('x-content-type-options')).toBe('nosniff')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
