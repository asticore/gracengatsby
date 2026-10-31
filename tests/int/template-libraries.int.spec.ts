// @vitest-environment node
// Template libraries (slice 1): URL rules, the library.json validator, the legacy fallback, GitHub
// loading through a mocked fetch, picture dedupe with a fake engine, and the route refusals.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAdminContext } = vi.hoisted(() => ({ getAdminContext: vi.fn() }))
vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/media/store', () => ({ readUploadPolicy: async () => ({ maxBytes: 5 * 1024 * 1024 }) }))

import { clearTemplateRepoCache } from '@/features/templateRepos/fetch'
import { parseLibraryUrl } from '@/features/templateLibraries/url'
import { parseLibraryText, validateLibraryManifest } from '@/features/templateLibraries/manifest'
import { loadItemTemplate, loadLibraryManifest } from '@/features/templateLibraries/loader'
import { normaliseLibraryState, readLibraryState } from '@/features/templateLibraries/store'
import { importItemPictures, slugFromTitle } from '@/features/templateLibraries/server'
import { LIBRARY_LIMITS } from '@/features/templateLibraries/types'
import { GET as listGET } from '@/app/(engage)/api/template-libraries/route'
import { POST as settingsPOST } from '@/app/(engage)/api/template-libraries/settings/route'
import { POST as usePOST } from '@/app/(engage)/api/template-libraries/use/route'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const PNG_OTHER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9])

const library = (over: Record<string, unknown> = {}) => ({
  format: 'engage-library',
  schemaVersion: 1,
  name: 'Acme sections',
  items: [
    {
      slug: 'split-hero',
      title: 'Split hero',
      kind: 'section',
      category: 'Hero',
      tags: ['hero', 'split'],
      preview: 'previews/split-hero.png',
      file: 'items/split-hero.json',
    },
  ],
  ...over,
})

const itemFile = (over: Record<string, unknown> = {}) => ({
  format: 'engage-template',
  schemaVersion: 1,
  kind: 'section',
  tree: [{ blockType: 'richText', content: '<p>Hello</p>' }],
  assets: [] as unknown[],
  requires: {},
  ...over,
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const bytes = (data: Uint8Array, type = 'image/png') => new Response(data as unknown as BodyInit, { status: 200, headers: { 'content-type': type } })
const errorOf = (result: { ok: boolean; error?: string }): string => (result.ok ? '' : (result.error ?? ''))

describe('library URLs', () => {
  it('accepts the repository, a branch and a folder on github.com', () => {
    const root = parseLibraryUrl('https://github.com/acme/sections')
    expect(root.ok).toBe(true)
    if (root.ok) expect(root.value.config).toMatchObject({ owner: 'acme', repo: 'sections', branch: 'main', path: '', enabled: true })

    const folder = parseLibraryUrl('https://github.com/acme/sections.git/tree/release/library/v2/')
    expect(folder.ok).toBe(true)
    if (folder.ok) {
      expect(folder.value.config).toMatchObject({ repo: 'sections', branch: 'release', path: 'library/v2' })
      expect(folder.value.url).toBe('https://github.com/acme/sections/tree/release/library/v2')
    }
  })

  it('refuses anything that is not a plain https github.com folder', () => {
    const refused = [
      'http://github.com/acme/sections',
      'https://gist.github.com/acme/sections',
      'https://raw.githubusercontent.com/acme/sections/main/library.json',
      'https://api.github.com/repos/acme/sections',
      'https://evil.example.com/github.com/acme/sections',
      'https://user:pass@github.com/acme/sections',
      'https://github.com:8443/acme/sections',
      'https://github.com/acme/sections?x=1',
      'https://github.com/acme/sections#top',
      'https://github.com/acme',
      'https://github.com/acme/sections/blob/main/library.json',
      'https://github.com/acme/sections/tree/main/..%2Fsecret',
      'https://github.com/acme/..',
      'javascript:alert(1)',
      '',
      'x'.repeat(LIBRARY_LIMITS.urlMaxLength + 1),
    ]
    for (const url of refused) expect(parseLibraryUrl(url).ok, url).toBe(false)
  })
})

describe('library manifest', () => {
  it('accepts a good library.json and defaults the category', () => {
    const parsed = parseLibraryText(JSON.stringify(library()))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value).toMatchObject({ format: 'library', name: 'Acme sections' })
    const noCategory = validateLibraryManifest(library({ items: [{ ...library().items[0], category: undefined }] }))
    expect(noCategory.ok && noCategory.value.items[0].category).toBe('General')
  })

  it('refuses malformed libraries with a reason', () => {
    const first = library().items[0]
    const bad: unknown[] = [
      null,
      library({ format: 'other' }),
      library({ schemaVersion: 2 }),
      library({ name: '' }),
      library({ items: 'x' }),
      library({ items: [{ ...first, slug: 'Bad_Slug' }] }),
      library({ items: [{ ...first, slug: '../x' }] }),
      library({ items: [first, first] }),
      library({ items: [{ ...first, kind: 'layout' }] }),
      library({ items: [{ ...first, title: '' }] }),
      library({ items: [{ ...first, preview: '../previews/x.png' }] }),
      library({ items: [{ ...first, preview: '/abs/x.png' }] }),
      library({ items: [{ ...first, preview: 'previews/x.svg' }] }),
      library({ items: [{ ...first, file: 'items/split-hero.txt' }] }),
      library({ items: [{ ...first, file: 'items/../../secret.json' }] }),
      library({ items: [{ ...first, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }] }),
      library({ items: [{ ...first, category: 'x'.repeat(61) }] }),
    ]
    for (const data of bad) expect(validateLibraryManifest(data).ok, JSON.stringify(data).slice(0, 120)).toBe(false)
    expect(errorOf(parseLibraryText('not json'))).toMatch(/not valid JSON/)
    expect(errorOf(parseLibraryText('x'.repeat(600 * 1024)))).toMatch(/too large/)
  })

  it('caps the number of items', () => {
    const many = Array.from({ length: LIBRARY_LIMITS.maxItems + 1 }, (_, i) => ({ ...library().items[0], slug: `s${i}`, file: `items/s${i}.json`, preview: `previews/s${i}.png` }))
    expect(validateLibraryManifest(library({ items: many })).ok).toBe(false)
  })
})

describe('saved library rows', () => {
  it('reports a bad address on its own row and keeps the good ones', () => {
    const state = normaliseLibraryState({
      libraries: [
        { id: 'a', label: 'Good', url: 'https://github.com/acme/sections', enabled: true },
        { id: 'b', label: 'Bad', url: 'https://example.com/acme', enabled: true },
        { id: 'c', label: 'Off', url: 'https://github.com/acme/other', enabled: 0 },
      ],
      imports: [{ sha256: 'nope', mediaId: 1 }, { sha256: 'a'.repeat(64), mediaId: 7, sourceUrl: 'u' }],
    })
    expect(state.rows.map((row) => [row.id, Boolean(row.config), row.enabled])).toEqual([
      ['a', true, true],
      ['b', false, true],
      ['c', true, false],
    ])
    expect(state.rows[1].error).toMatch(/github.com/)
    expect(state.imports).toEqual([{ sha256: 'a'.repeat(64), mediaId: 7, sourceUrl: 'u' }])
  })
})

describe('loading from GitHub (mocked fetch)', () => {
  const config = { label: 'Acme', owner: 'acme', repo: 'sections', branch: 'main', path: 'lib', enabled: true }
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearTemplateRepoCache()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads library.json from the raw host, folder included, with redirects refused', async () => {
    fetchMock.mockResolvedValueOnce(json(library()))
    const result = await loadLibraryManifest(config)
    expect(result.ok && result.value.format).toBe('library')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://raw.githubusercontent.com/acme/sections/main/lib/library.json')
    expect((init as RequestInit).redirect).toBe('error')
  })

  it('falls back to an older manifest.json and maps its categories', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }))
    fetchMock.mockResolvedValueOnce(
      json({
        schemaVersion: 1,
        name: 'Old repo',
        categories: [{ key: 'hero', label: 'Heroes' }],
        templates: [{ slug: 'big', title: 'Big', kind: 'page', category: 'hero', tags: [], preview: 'templates/big/preview.png', file: 'templates/big/template.json' }],
      }),
    )
    const result = await loadLibraryManifest(config)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toMatchObject({ format: 'legacy', name: 'Old repo', items: [{ slug: 'big', category: 'Heroes' }] })
  })

  it('says what to add when neither file exists, and shows other errors as they are', async () => {
    fetchMock.mockResolvedValue(new Response('missing', { status: 404 }))
    expect(errorOf(await loadLibraryManifest(config))).toMatch(/no library\.json/)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    expect(errorOf(await loadLibraryManifest(config))).toMatch(/error \(500\)/)
  })

  it('reports a network failure without leaking detail', async () => {
    fetchMock.mockRejectedValue(new TypeError('socket hang up'))
    expect(errorOf(await loadLibraryManifest(config))).toBe('Could not reach GitHub. Try again.')
  })

  it('loads an item and refuses one whose kind differs from the manifest', async () => {
    const item = library().items[0]
    fetchMock.mockResolvedValueOnce(json(itemFile()))
    const ok = await loadItemTemplate(config, item as never)
    expect(ok.ok).toBe(true)
    clearTemplateRepoCache()
    fetchMock.mockResolvedValueOnce(json(itemFile({ kind: 'page' })))
    expect(errorOf(await loadItemTemplate(config, item as never))).toMatch(/listed as a section/)
  })
})

describe('pictures: saved once, reused by hash', () => {
  const config = { label: 'Acme', owner: 'acme', repo: 'sections', branch: 'main', path: '', enabled: true }
  type Engine = ReturnType<typeof fakeEngine>
  const fakeEngine = (state: Record<string, unknown>, existingMedia: number[] = []) => {
    const created: Array<{ id: number }> = []
    const updates: Array<Record<string, unknown>> = []
    let nextId = 100
    return {
      created,
      updates,
      findGlobal: vi.fn(async () => state),
      updateGlobal: vi.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data)
        return args.data
      }),
      findByID: vi.fn(async ({ id }: { id: number }) =>
        existingMedia.includes(id) || created.some((item) => item.id === id) ? { id, url: `/media/${id}.png` } : null,
      ),
      create: vi.fn(async (_args: { collection: string; data: Record<string, unknown> }) => {
        const id = nextId++
        created.push({ id })
        return { id, url: `/media/${id}.png` }
      }),
      find: vi.fn(async () => ({ docs: [] })),
    }
  }
  const ctx = (engine: Engine) => ({ user: { id: 1 }, isAdmin: true, can: () => true, engine })
  const tree = [{ blockType: 'hero', backgroundImage: 'asset:a' }]
  const withAssets = (assets: unknown[]) => ({ format: 'engage-template', schemaVersion: 1, kind: 'section', tree, assets, requires: {} })

  beforeEach(() => {
    clearTemplateRepoCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves two identical pictures once and records the hash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bytes(PNG)))
    const engine = fakeEngine({ libraries: [], imports: [] })
    const result = await importItemPictures(
      ctx(engine) as never,
      config,
      withAssets([
        { id: 'a', path: 'images/one.png', alt: 'One' },
        { id: 'b', path: 'images/two.png', alt: 'Two' },
      ]) as never,
      'https://github.com/acme/sections#items/x.json',
      false,
    )
    expect(result.ok).toBe(true)
    expect(engine.created.length).toBe(1)
    if (result.ok) expect(result.saved).toBe(1)
    expect(engine.updates.length).toBe(1)
    expect((engine.updates[0].imports as Array<{ sha256: string }>)[0].sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reuses a picture already in the gallery and saves a new one', async () => {
    const fetchMock = vi.fn(async (url: string) => bytes(url.includes('one') ? PNG : PNG_OTHER))
    vi.stubGlobal('fetch', fetchMock)
    const known = await (async () => {
      const { sha256Hex } = await import('@/features/templateRepos/insertAssets')
      return sha256Hex(PNG)
    })()
    const engine = fakeEngine({ libraries: [], imports: [{ sha256: known, mediaId: 55, sourceUrl: 'x' }] }, [55])
    const result = await importItemPictures(
      ctx(engine) as never,
      config,
      withAssets([
        { id: 'a', path: 'images/one.png', alt: 'One' },
        { id: 'b', path: 'images/other.png', alt: 'Other' },
      ]) as never,
      'src',
      false,
    )
    expect(result.ok && result.reused).toBe(1)
    expect(engine.created.length).toBe(1)
  })

  it('does not reuse a record whose media item was deleted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bytes(PNG)))
    const { sha256Hex } = await import('@/features/templateRepos/insertAssets')
    const known = await sha256Hex(PNG)
    const engine = fakeEngine({ libraries: [], imports: [{ sha256: known, mediaId: 55, sourceUrl: 'x' }] }, [])
    const result = await importItemPictures(ctx(engine) as never, config, withAssets([{ id: 'a', path: 'images/one.png', alt: '' }]) as never, 'src', false)
    expect(result.ok && result.saved).toBe(1)
    expect(engine.created.length).toBe(1)
  })

  it('saves nothing when a picture is not really an image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 'image/png')))
    const engine = fakeEngine({ libraries: [], imports: [] })
    const result = await importItemPictures(ctx(engine) as never, config, withAssets([{ id: 'a', path: 'images/one.png', alt: '' }]) as never, 'src', false)
    expect(result.ok).toBe(false)
    expect(engine.created.length).toBe(0)
  })

  it('reads state through the engine global and makes slugs for pages', async () => {
    const engine = fakeEngine({ libraries: [{ id: 'a', url: 'https://github.com/acme/sections', enabled: true }] })
    const state = await readLibraryState(engine as never)
    expect(state.rows[0].config?.repo).toBe('sections')
    expect(slugFromTitle('Hero: Café & Tea!')).toBe('hero-cafe-tea')
    expect(slugFromTitle('!!!')).toMatch(/^page-/)
  })
})

describe('routes refuse people who should not see or change libraries', () => {
  afterEach(() => {
    getAdminContext.mockReset()
  })

  it('returns 401 with no signed-in user', async () => {
    getAdminContext.mockResolvedValue({ user: null, isAdmin: false, can: () => false, engine: {} })
    const res = await listGET(new Request('https://site.test/api/template-libraries'))
    expect(res.status).toBe(401)
  })

  it('returns 403 for a signed-in person who cannot use templates', async () => {
    getAdminContext.mockResolvedValue({ user: { id: 2 }, isAdmin: false, can: () => false, engine: {} })
    const res = await usePOST(new Request('https://site.test/api/template-libraries/use', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(403)
  })

  it('lets only administrators change the list', async () => {
    getAdminContext.mockResolvedValue({ user: { id: 3 }, isAdmin: false, can: () => true, engine: {} })
    const res = await settingsPOST(new Request('https://site.test/api/template-libraries/settings', { method: 'POST', body: JSON.stringify({ action: 'add', url: 'https://github.com/a/b' }) }))
    expect(res.status).toBe(403)
  })

  it('refuses a non-GitHub address before anything is saved', async () => {
    const updateGlobal = vi.fn()
    getAdminContext.mockResolvedValue({
      user: { id: 1 },
      isAdmin: true,
      can: () => true,
      engine: { findGlobal: async () => ({ libraries: [] as unknown[] }), updateGlobal },
    })
    const res = await settingsPOST(new Request('https://site.test/api/template-libraries/settings', { method: 'POST', body: JSON.stringify({ action: 'add', url: 'https://evil.example/x' }) }))
    expect(res.status).toBe(400)
    expect(updateGlobal).not.toHaveBeenCalled()
  })
})
