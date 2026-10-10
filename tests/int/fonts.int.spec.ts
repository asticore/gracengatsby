// @vitest-environment node
// Site fonts: pure CSS/sanitiser rules, the Fontsource catalog cache, the
// install planner, and the three admin routes with fetch and R2 mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminContextMock = vi.hoisted(() => vi.fn())
const putMediaObjectMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/admin/auth', () => ({ getAdminContext: getAdminContextMock }))
vi.mock('@/localapi/storage', () => ({ putMediaObject: putMediaObjectMock }))

import {
  buildFontCss,
  googleStylesheetUrl,
  fontsourceFileUrl,
  preloadLinks,
  remoteStylesheetUrls,
  resolveThemeFont,
} from '@/features/fonts/css'
import {
  detectFontFormat,
  fontStack,
  localFontFileName,
  mergeInstalledFont,
  removeInstalledFont,
  sanitizeFamily,
  sanitizeFontId,
  sanitizeFontUrl,
  sanitizeInstalledFonts,
  sanitizeWeights,
  uniqueUploadFontId,
  uploadFontId,
} from '@/features/fonts/installed'
import { CATALOG_TTL_MS, loadCatalog, normaliseCatalog, resetCatalogCache, searchCatalog } from '@/features/fonts/catalog'
import { installFont, planInstall, type FontMetadata } from '@/features/fonts/install'
import type { CatalogFont, InstalledFont } from '@/features/fonts/types'
import { DEFAULT_CONTENT_SECURITY_POLICY } from '@/features/security/headers'
import { GET as searchGET } from '@/app/(engage)/api/admin-fonts-search/route'
import { POST as installPOST } from '@/app/(engage)/api/admin-fonts-install/route'
import { POST as uploadPOST } from '@/app/(engage)/api/admin-fonts-upload/route'

const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 2, 3, 4, 5, 6, 7])
const WOFF_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x46, 0, 1, 2, 3])
const TTF_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 9, 9, 9, 9])

const lora: InstalledFont = {
  id: 'lora',
  family: 'Lora',
  source: 'google',
  category: 'serif',
  weights: [400, 700],
  italic: false,
  local: false,
  files: {},
}

const uploadedBrand: InstalledFont = {
  id: 'upload-brand',
  family: 'Brand Sans',
  source: 'upload',
  weights: [400],
  italic: false,
  local: true,
  files: { '400-normal': '/api/media/file/font-upload-brand-400-normal.woff2' },
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('sanitisers', () => {
  it('accepts plain family names and trims them', () => {
    expect(sanitizeFamily('Lora')).toBe('Lora')
    expect(sanitizeFamily('  Open   Sans ')).toBe('Open Sans')
  })

  it('rejects family names that could break out of CSS', () => {
    for (const bad of ['', 'Lora;}body{', 'Lora"', "Lora'", '<script>', 'a'.repeat(61), 42, null]) {
      expect(sanitizeFamily(bad), String(bad)).toBeNull()
    }
  })

  it('accepts only lower-case slug ids', () => {
    expect(sanitizeFontId('open-sans')).toBe('open-sans')
    for (const bad of ['Open Sans', '../x', 'a"b', '-lead', '']) {
      expect(sanitizeFontId(bad), bad).toBeNull()
    }
  })

  it('keeps only allowed weights, de-duplicated and sorted', () => {
    expect(sanitizeWeights([700, 400, 400, 450, '300', 'x', 1000])).toEqual([300, 400, 700])
    expect(sanitizeWeights('400')).toEqual([])
  })

  it('accepts only this site media route or allow-listed https hosts', () => {
    expect(sanitizeFontUrl('/api/media/file/font-lora-400-normal.woff2')).toBe('/api/media/file/font-lora-400-normal.woff2')
    expect(sanitizeFontUrl('https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-normal.woff2')).toBeTruthy()
    expect(sanitizeFontUrl('https://fonts.googleapis.com/css2?family=Lora')).toBeTruthy()
    const rejected = [
      'http://cdn.jsdelivr.net/x.woff2',
      'https://evil.example/x.woff2',
      'javascript:alert(1)',
      '/api/media/file/../secret',
      '/api/media/file/a"b.woff2',
      'https://cdn.jsdelivr.net/a"b.woff2',
      'https://cdn.jsdelivr.net/a(b).woff2',
      'https://user:pw@cdn.jsdelivr.net/x.woff2',
    ]
    for (const url of rejected) expect(sanitizeFontUrl(url), url).toBeNull()
  })

  it('drops unsafe or incomplete entries and keeps the good ones', () => {
    const cleaned = sanitizeInstalledFonts([
      lora,
      { ...lora, id: 'Bad Id' },
      { ...lora, id: 'inter', family: 'Inter' },
      { ...lora, id: 'lora' },
      { ...uploadedBrand, id: 'empty-local', files: {} },
      { ...uploadedBrand, id: 'bad-urls', files: { '400-normal': 'https://evil.example/x.woff2' } },
      { ...lora, id: 'weightless', weights: [] },
      null,
      'nope',
    ])
    expect(cleaned.map((f) => f.id)).toEqual(['lora'])
  })

  it('parses a JSON string value and tolerates garbage', () => {
    expect(sanitizeInstalledFonts(JSON.stringify([lora]))[0]?.family).toBe('Lora')
    expect(sanitizeInstalledFonts('{not json')).toEqual([])
    expect(sanitizeInstalledFonts(undefined)).toEqual([])
  })

  it('builds font stacks with a category fallback and never trusts the family', () => {
    expect(fontStack('Lora', 'serif')).toBe('"Lora", Georgia, serif')
    expect(fontStack('Fira Code', 'monospace')).toBe('"Fira Code", ui-monospace, monospace')
    expect(fontStack('Nova', 'handwriting')).toBe('"Nova", cursive')
    expect(fontStack('Nova')).toBe('"Nova", system-ui, sans-serif')
    expect(fontStack('x";}body{')).toBe('sans-serif')
  })
})

describe('upload ids', () => {
  it('keeps the plain id for a new family and for the same family already installed', () => {
    expect(uniqueUploadFontId('Brand Sans', [])).toBe('upload-brand-sans')
    expect(uniqueUploadFontId('Brand Sans', [{ id: 'upload-brand-sans', family: 'Brand Sans' }])).toBe('upload-brand-sans')
  })

  it('appends the next free suffix when a different family already owns the slug', () => {
    const taken = [{ id: 'upload-brand-sans', family: 'Brand Sans Old' }]
    expect(uniqueUploadFontId('Brand Sans', taken)).toBe('upload-brand-sans-2')
    const taken2 = [...taken, { id: 'upload-brand-sans-2', family: 'Brand Sans Third' }]
    expect(uniqueUploadFontId('Brand Sans', taken2)).toBe('upload-brand-sans-3')
  })

  it('reuses a suffixed id when the same family is already installed under it', () => {
    const taken = [
      { id: 'upload-brand-sans', family: 'Brand Sans Old' },
      { id: 'upload-brand-sans-2', family: 'Brand Sans' },
    ]
    expect(uniqueUploadFontId('Brand Sans', taken)).toBe('upload-brand-sans-2')
  })

  it('returns null for a family with nothing to slug', () => {
    expect(uniqueUploadFontId('---', [])).toBeNull()
  })
})

describe('font files', () => {
  it('detects WOFF2, WOFF and TTF by their bytes and rejects everything else', () => {
    expect(detectFontFormat(WOFF2_BYTES)).toBe('woff2')
    expect(detectFontFormat(WOFF_BYTES)).toBe('woff')
    expect(detectFontFormat(TTF_BYTES)).toBe('ttf')
    expect(detectFontFormat(new TextEncoder().encode('<!doctype html><script>alert(1)</script>'))).toBeNull()
    expect(detectFontFormat(new Uint8Array([1, 2]))).toBeNull()
  })

  it('names files and upload ids safely', () => {
    expect(localFontFileName('upload-brand', 700, 'italic', 'woff2')).toBe('font-upload-brand-700-italic.woff2')
    expect(uploadFontId('My Brand!')).toBe('upload-my-brand')
    expect(uploadFontId('!!!')).toBeNull()
  })

  it('merges a second upload into the same family and removes by id', () => {
    const second: InstalledFont = {
      ...uploadedBrand,
      weights: [700],
      italic: true,
      files: { '700-italic': '/api/media/file/font-upload-brand-700-italic.woff2' },
    }
    const merged = mergeInstalledFont([uploadedBrand], second)
    expect(merged).toHaveLength(1)
    expect(merged[0]?.weights).toEqual([400, 700])
    expect(merged[0]?.italic).toBe(true)
    expect(Object.keys(merged[0]?.files ?? {})).toEqual(['400-normal', '700-italic'])

    expect(mergeInstalledFont([lora], uploadedBrand)).toHaveLength(2)
    expect(removeInstalledFont(merged, 'upload-brand')).toEqual([])
  })
})

describe('CSS generation', () => {
  it('builds a Google CSS2 URL with the installed weights', () => {
    expect(googleStylesheetUrl(lora)).toBe('https://fonts.googleapis.com/css2?family=Lora:wght@400;700&display=swap')
    expect(googleStylesheetUrl({ ...lora, family: 'Open Sans', weights: [700, 400], italic: true })).toBe(
      'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400;1,700&display=swap',
    )
  })

  it('lists every upright tuple before every italic one, ascending, with no repeats', () => {
    const url = googleStylesheetUrl({ ...lora, family: 'Lato', weights: [900, 300, 300, 100], italic: true })
    expect(url).toBe('https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,100;0,300;0,900;1,100;1,300;1,900&display=swap')
    const tuples = decodeURIComponent(url.split('ital,wght@')[1]).split('&')[0].split(';')
    expect(tuples).toEqual([...tuples].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })))
    expect(new Set(tuples).size).toBe(tuples.length)
  })

  it('links Google stylesheets only for remote Google fonts, once each', () => {
    expect(remoteStylesheetUrls([lora, lora, uploadedBrand])).toEqual([googleStylesheetUrl(lora)])
    expect(remoteStylesheetUrls([{ ...lora, local: true, files: { '400-normal': '/api/media/file/font-lora-400-normal.woff2' } }])).toEqual([])
  })

  it('builds jsDelivr @font-face rules for remote Fontsource fonts', () => {
    const fontsource: InstalledFont = { ...lora, id: 'lato', family: 'Lato', source: 'fontsource', weights: [400], italic: true, category: 'sans-serif' }
    const css = buildFontCss([fontsource])
    expect(css).toContain(`src: url("${fontsourceFileUrl('lato', 400, 'normal')}") format("woff2")`)
    expect(css).toContain(`src: url("${fontsourceFileUrl('lato', 400, 'italic')}") format("woff2")`)
    expect(css).toContain('font-family: "Lato"')
    expect(css).toContain('font-display: swap')
  })

  it('builds @font-face for uploads with the right format and emits nothing for Google remote fonts', () => {
    const css = buildFontCss([uploadedBrand, lora])
    expect(css).toContain('font-family: "Brand Sans"')
    expect(css).toContain('src: url("/api/media/file/font-upload-brand-400-normal.woff2") format("woff2")')
    expect(css).not.toContain('Lora')
  })

  it('resolves theme font values, falling back to the default for names that only exist on Object.prototype', () => {
    const headingVars = { cormorant: 'var(--font-cormorant)', playfair: 'var(--font-playfair)' }
    for (const hostile of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(resolveThemeFont(hostile, headingVars, 'cormorant', [])).toEqual({ stack: 'var(--font-cormorant)', installed: null })
    }
    expect(resolveThemeFont('playfair', headingVars, 'cormorant', [])).toEqual({ stack: 'var(--font-playfair)', installed: null })
    expect(resolveThemeFont(undefined, headingVars, 'cormorant', [])).toEqual({ stack: 'var(--font-cormorant)', installed: null })
    const resolved = resolveThemeFont('lora', headingVars, 'cormorant', [lora])
    expect(resolved.installed).toBe(lora)
    expect(resolved.stack).toBe('"Lora", Georgia, serif')
  })

  it('skips fonts that fail validation instead of emitting them', () => {
    const hostile = { ...uploadedBrand, family: 'Brand"}body{' }
    expect(buildFontCss([hostile])).toBe('')
  })

  it('preloads only the upright local files of the families in use', () => {
    const otherUpload: InstalledFont = {
      ...uploadedBrand,
      id: 'upload-other',
      family: 'Other',
      weights: [400, 700],
      files: {
        '400-normal': '/api/media/file/font-upload-other-400-normal.woff2',
        '700-normal': '/api/media/file/font-upload-other-700-normal.woff',
        '700-italic': '/api/media/file/font-upload-other-700-italic.woff2',
      },
    }
    const preloads = preloadLinks([uploadedBrand, otherUpload, lora], ['Brand Sans', 'Other'])
    expect(preloads).toEqual([
      { href: '/api/media/file/font-upload-brand-400-normal.woff2', type: 'font/woff2' },
      { href: '/api/media/file/font-upload-other-400-normal.woff2', type: 'font/woff2' },
      { href: '/api/media/file/font-upload-other-700-normal.woff', type: 'font/woff' },
    ])
    expect(preloadLinks([uploadedBrand], ['Unused'])).toEqual([])
  })
})

describe('catalog', () => {
  const catalog: CatalogFont[] = normaliseCatalog({
    lora: { id: 'lora', family: 'Lora', type: 'google', weights: [400, 700], styles: ['normal', 'italic'], subsets: ['latin'], category: 'serif' },
    'open-sans': { id: 'open-sans', family: 'Open Sans', type: 'google', weights: [400], styles: ['normal'], subsets: ['latin'] },
    'lato-local': { id: 'lato-local', family: 'Latomax', type: 'other', weights: [400], styles: ['normal'], subsets: ['latin'] },
    broken: { id: 'Broken Id', family: 'Nope', type: 'google' },
  })

  beforeEach(() => resetCatalogCache())

  it('normalises the object form and drops entries that cannot be rendered', () => {
    expect(catalog.map((f) => f.id)).toEqual(['lora', 'open-sans', 'lato-local'])
    expect(normaliseCatalog([{ id: 'lora', family: 'Lora', type: 'google', weights: [400] }])).toHaveLength(1)
  })

  it('searches by family substring, prefers prefix matches, and filters by source', () => {
    expect(searchCatalog(catalog, '')).toEqual([])
    // Prefix matches first ("Open Sans"), then the rest alphabetically.
    expect(searchCatalog(catalog, 'o').map((f) => f.id)).toEqual(['open-sans', 'lato-local', 'lora'])
    expect(searchCatalog(catalog, 'o', 'google').map((f) => f.id)).toEqual(['open-sans', 'lora'])
    expect(searchCatalog(catalog, 'to', 'other').map((f) => f.id)).toEqual(['lato-local'])
    expect(searchCatalog(catalog, 'zzz')).toEqual([])
  })

  it('caps results and caches the list for an hour', async () => {
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, { id: `f${i}`, family: `Font ${i}`, type: 'google', weights: [400] }]))
    const fetchMock = vi.fn(async () => jsonResponse(many))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const first = await loadCatalog(fetchMock as unknown as typeof fetch, 1_000)
      expect(searchCatalog(first, 'font')).toHaveLength(30)
      await loadCatalog(fetchMock as unknown as typeof fetch, 1_000 + CATALOG_TTL_MS - 1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      await loadCatalog(fetchMock as unknown as typeof fetch, 1_000 + CATALOG_TTL_MS + 1)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not cache a failed fetch', async () => {
    const fetchMock = vi.fn(async () => new Response('down', { status: 503 }))
    await expect(loadCatalog(fetchMock as unknown as typeof fetch, 5)).rejects.toThrow('503')
    fetchMock.mockImplementationOnce(async () => jsonResponse({ lora: { id: 'lora', family: 'Lora', type: 'google', weights: [400] } }))
    const recovered = await loadCatalog(fetchMock as unknown as typeof fetch, 6)
    expect(recovered.map((f) => f.id)).toEqual(['lora'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('install planning', () => {
  const meta: FontMetadata = {
    id: 'lora',
    family: 'Lora',
    category: 'serif',
    weights: [400, 500, 700],
    styles: ['normal', 'italic'],
    subsets: ['latin', 'cyrillic'],
    type: 'google',
  }

  it('defaults to weight 400 and maps google fonts to the google source', () => {
    const result = planInstall(meta, {})
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.font).toMatchObject({ id: 'lora', family: 'Lora', source: 'google', weights: [400], italic: false, local: false, category: 'serif' })
      expect(result.plan.targets).toEqual([{ weight: 400, style: 'normal', key: '400-normal' }])
    }
  })

  it('lists a target per weight and style for italic local installs', () => {
    const result = planInstall(meta, { weights: [700, 400], italic: true, local: true })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.font.local).toBe(true)
      expect(result.plan.targets.map((t) => t.key)).toEqual(['400-normal', '400-italic', '700-normal', '700-italic'])
    }
  })

  it('refuses weights, italics or subsets the family does not have', () => {
    expect(planInstall(meta, { weights: [900] })).toMatchObject({ ok: false, status: 400 })
    expect(planInstall({ ...meta, styles: ['normal'] }, { italic: true })).toMatchObject({ ok: false, status: 400 })
    expect(planInstall({ ...meta, subsets: ['cyrillic'] }, {})).toMatchObject({ ok: false, status: 422 })
  })

  it('maps non-google families to the fontsource source', () => {
    const result = planInstall({ ...meta, type: 'other' }, {})
    expect(result.ok && result.plan.font.source).toBe('fontsource')
  })
})

describe('installFont orchestration', () => {
  const metadata = {
    id: 'lora',
    family: 'Lora',
    category: 'serif',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    subsets: ['latin'],
    type: 'google',
  }

  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.fontsource.org/v1/fonts/')) return jsonResponse(metadata)
      if (url.startsWith('https://cdn.jsdelivr.net/')) return new Response(WOFF2_BYTES, { status: 200 })
      return new Response('nope', { status: 404 })
    })
  })

  it('returns 404 for an unknown font and refuses built-in ids', async () => {
    const missing = vi.fn(async () => new Response('', { status: 404 }))
    expect(await installFont('lora', {}, { fetch: missing as unknown as typeof fetch })).toMatchObject({ ok: false, status: 404 })
    expect(await installFont('inter', {}, { fetch: fetchMock as unknown as typeof fetch })).toMatchObject({ ok: false, status: 409 })
  })

  it('installs a remote font without storing anything', async () => {
    const store = vi.fn()
    const outcome = await installFont('lora', { weights: [400, 700] }, { fetch: fetchMock as unknown as typeof fetch, store })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.font).toMatchObject({ id: 'lora', source: 'google', local: false, files: {} })
    expect(store).not.toHaveBeenCalled()
  })

  it('downloads each woff2 from jsDelivr and stores it under a flat key', async () => {
    const store = vi.fn(async () => undefined)
    const outcome = await installFont('lora', { weights: [700], local: true }, { fetch: fetchMock as unknown as typeof fetch, store })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.font.files).toEqual({ '700-normal': '/api/media/file/font-lora-700-normal.woff2' })
    }
    expect(store).toHaveBeenCalledWith('font-lora-700-normal.woff2', expect.any(Uint8Array), 'font/woff2')
    expect(fetchMock).toHaveBeenCalledWith('https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-700-normal.woff2', expect.anything())
  })

  it('reports a bad download as 502 and stores nothing for it', async () => {
    const store = vi.fn(async () => undefined)
    const html = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.fontsource.org/')) return jsonResponse(metadata)
      return new Response('<html></html>', { status: 200 })
    })
    const outcome = await installFont('lora', { local: true }, { fetch: html as unknown as typeof fetch, store })
    expect(outcome).toMatchObject({ ok: false, status: 502 })
    expect(store).not.toHaveBeenCalled()
  })
})

describe('admin routes', () => {
  const siteFonts: { current: unknown[] } = { current: [] }
  const allowed = {
    isAdmin: true,
    can: () => true,
    engine: { findGlobal: vi.fn(async () => ({ theme: { customFonts: siteFonts.current } })) },
  }
  const denied = { isAdmin: false, can: () => false }
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    getAdminContextMock.mockReset()
    putMediaObjectMock.mockClear()
    resetCatalogCache()
    siteFonts.current = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllGlobals()
  })

  it('returns 403 to users without site-settings update rights', async () => {
    getAdminContextMock.mockResolvedValue(denied)
    const search = await searchGET(new Request('https://example.test/api/admin-fonts-search?q=lora'))
    expect(search.status).toBe(403)
    const install = await installPOST(new Request('https://example.test/api/admin-fonts-install', { method: 'POST', body: '{}' }))
    expect(install.status).toBe(403)
    const form = new FormData()
    form.append('file', new File([WOFF2_BYTES], 'a.woff2'))
    const upload = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(upload.status).toBe(403)
  })

  it('searches the catalog for admins and returns the trimmed fields', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ lora: { id: 'lora', family: 'Lora', type: 'google', weights: [400], styles: ['normal'], subsets: ['latin'], category: 'serif', extra: 'x' } }),
    ) as unknown as typeof fetch
    const response = await searchGET(new Request('https://example.test/api/admin-fonts-search?q=lo&source=google'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { results: Array<Record<string, unknown>> }
    expect(body.results).toEqual([
      { id: 'lora', family: 'Lora', category: 'serif', weights: [400], styles: ['normal'], subsets: ['latin'], type: 'google' },
    ])
  })

  it('returns 502 when the catalog is unreachable', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const response = await searchGET(new Request('https://example.test/api/admin-fonts-search?q=lora'))
    expect(response.status).toBe(502)
  })

  it('installs a font from a JSON body, storing local files in R2', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.startsWith('https://api.fontsource.org/')) {
        return jsonResponse({ id: 'lora', family: 'Lora', type: 'google', weights: [400], styles: ['normal'], subsets: ['latin'] })
      }
      return new Response(WOFF2_BYTES, { status: 200 })
    }) as unknown as typeof fetch
    const response = await installPOST(
      new Request('https://example.test/api/admin-fonts-install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'lora', weights: [400], local: true }),
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { font: InstalledFont }
    expect(body.font.files).toEqual({ '400-normal': '/api/media/file/font-lora-400-normal.woff2' })
    expect(putMediaObjectMock).toHaveBeenCalledWith('font-lora-400-normal.woff2', expect.any(Uint8Array), 'font/woff2')
  })

  it('rejects a malformed install body and an unsafe id', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    const notJson = await installPOST(new Request('https://example.test/api/admin-fonts-install', { method: 'POST', body: 'nope' }))
    expect(notJson.status).toBe(400)
    const badId = await installPOST(
      new Request('https://example.test/api/admin-fonts-install', { method: 'POST', body: JSON.stringify({ id: '../x' }) }),
    )
    expect(badId.status).toBe(400)
  })

  it('stores a valid uploaded font and returns it as an upload', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    const form = new FormData()
    form.append('file', new File([WOFF2_BYTES], 'brand.woff2', { type: 'font/woff2' }))
    form.append('family', 'Brand Sans')
    form.append('weight', '700')
    form.append('style', 'italic')
    const response = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { font: InstalledFont }
    expect(body.font).toMatchObject({ id: 'upload-brand-sans', source: 'upload', weights: [700], italic: true, local: true })
    expect(body.font.files).toEqual({ '700-italic': '/api/media/file/font-upload-brand-sans-700-italic.woff2' })
    expect(putMediaObjectMock).toHaveBeenCalledWith('font-upload-brand-sans-700-italic.woff2', expect.any(Uint8Array), 'font/woff2')
  })

  it('gives a different family a suffixed id instead of overwriting the installed one', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    siteFonts.current = [{ id: 'upload-brand-sans', family: 'Brand Sans Old', source: 'upload', weights: [400], italic: false, local: true, files: { '400-normal': '/api/media/file/font-upload-brand-sans-400-normal.woff2' } }]
    const form = new FormData()
    form.append('file', new File([WOFF2_BYTES], 'brand.woff2'))
    form.append('family', 'Brand Sans')
    form.append('weight', '400')
    const response = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(response.status).toBe(200)
    const body = (await response.json()) as { font: InstalledFont }
    expect(body.font).toMatchObject({ id: 'upload-brand-sans-2', family: 'Brand Sans' })
    expect(body.font.files).toEqual({ '400-normal': '/api/media/file/font-upload-brand-sans-2-400-normal.woff2' })
    expect(putMediaObjectMock).toHaveBeenCalledWith('font-upload-brand-sans-2-400-normal.woff2', expect.any(Uint8Array), 'font/woff2')
  })

  it('keeps the plain id when the same family is already installed, so a new weight merges', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    siteFonts.current = [{ id: 'upload-brand-sans', family: 'Brand Sans', source: 'upload', weights: [400], italic: false, local: true, files: { '400-normal': '/api/media/file/font-upload-brand-sans-400-normal.woff2' } }]
    const form = new FormData()
    form.append('file', new File([WOFF2_BYTES], 'brand.woff2'))
    form.append('family', 'Brand Sans')
    form.append('weight', '700')
    const response = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(((await response.json()) as { font: InstalledFont }).font.id).toBe('upload-brand-sans')
  })

  it('stores nothing when the installed fonts cannot be read', async () => {
    getAdminContextMock.mockResolvedValue({
      isAdmin: true,
      can: () => true,
      engine: { findGlobal: vi.fn(async () => { throw new Error('db down') }) },
    })
    const form = new FormData()
    form.append('file', new File([WOFF2_BYTES], 'brand.woff2'))
    form.append('family', 'Brand Sans')
    form.append('weight', '400')
    const response = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(response.status).toBe(502)
    expect(putMediaObjectMock).not.toHaveBeenCalled()
  })

  it('refuses a body declared larger than 3 MB with 413 before reading the form', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    const request = new Request('https://example.test/api/admin-fonts-upload', {
      method: 'POST',
      headers: { 'content-length': String(3 * 1024 * 1024 + 1) },
      body: 'x',
    })
    const formData = vi.spyOn(request, 'formData')
    const response = await uploadPOST(request)
    expect(response.status).toBe(413)
    expect(formData).not.toHaveBeenCalled()
    expect(putMediaObjectMock).not.toHaveBeenCalled()
  })

  it('refuses files that are not fonts, whatever their name says', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    const form = new FormData()
    form.append('file', new File(['<script>alert(1)</script>'], 'evil.woff2', { type: 'font/woff2' }))
    form.append('family', 'Evil')
    form.append('weight', '400')
    const response = await uploadPOST(new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form }))
    expect(response.status).toBe(415)
    expect(putMediaObjectMock).not.toHaveBeenCalled()
  })

  it('validates the upload form fields', async () => {
    getAdminContextMock.mockResolvedValue(allowed)
    const make = (fields: Record<string, string>) => {
      const form = new FormData()
      form.append('file', new File([TTF_BYTES], 'a.ttf'))
      for (const [k, v] of Object.entries(fields)) form.append(k, v)
      return new Request('https://example.test/api/admin-fonts-upload', { method: 'POST', body: form })
    }
    expect((await uploadPOST(make({ family: 'Bad;}', weight: '400' }))).status).toBe(400)
    expect((await uploadPOST(make({ family: 'Ok', weight: '450' }))).status).toBe(400)
    expect((await uploadPOST(make({ family: 'Ok', weight: '400', style: 'oblique' }))).status).toBe(400)
    expect((await uploadPOST(make({ family: 'Ok', weight: '400' }))).status).toBe(200)
  })
})

describe('security headers for font hosts', () => {
  it('allows Google Fonts stylesheets and the font file hosts without loosening anything else', () => {
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net")
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(DEFAULT_CONTENT_SECURITY_POLICY).toContain("connect-src 'self' https:")
  })
})
