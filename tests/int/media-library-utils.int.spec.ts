// @vitest-environment node
// Pure media-library logic: folders, where-used scanning, delivery URLs, and the
// stock photo search and import guards (fetch mocked throughout).
import { describe, expect, it, vi } from 'vitest'

import { distinctFolders, sanitizeFolder } from '@/features/media/folders'
import { buildImageUrl, cropRatio, focusFor, objectPositionFor, withVersion, buildTransformParams } from '@/features/media/url'
import { DISABLED_CONFIG } from '@/features/media/url'
import type { MediaConfig } from '@/features/media/types'
import { editUrlFor, findMediaPaths, scanMediaUsage, type UsageEngine, type UsageTarget } from '@/features/media/usage'
import {
  buildSearchRequest,
  fetchImportBytes,
  importAltText,
  importFileName,
  isPrivateHostname,
  normaliseOpenverse,
  normalisePixabay,
  normalisePexels,
  normaliseUnsplash,
  OPENVERSE_IMAGE_HOSTS,
  resolveImportUrl,
  searchStock,
  StockError,
  validateImportUrl,
} from '@/features/media/stock'

const enabled: MediaConfig = {
  ...DISABLED_CONFIG,
  enabled: true,
  provider: 'cloudflare-resizing',
  quality: 80,
  format: 'auto',
  stripMetadata: true,
  maxWidth: 2560,
  maxHeight: 2560,
  responsiveWidths: [],
}

describe('sanitizeFolder', () => {
  it('tidies slashes and spacing', () => {
    expect(sanitizeFolder('  /products//summer /  ')).toBe('products/summer')
    expect(sanitizeFolder('Spring  Sale')).toBe('Spring Sale')
    expect(sanitizeFolder('')).toBe('')
    expect(sanitizeFolder(undefined)).toBe('')
  })

  it('refuses dots, symbols, overlong and non-string values', () => {
    expect(sanitizeFolder('../etc')).toBeNull()
    expect(sanitizeFolder('a<script>')).toBeNull()
    expect(sanitizeFolder('x'.repeat(121))).toBeNull()
    expect(sanitizeFolder(42)).toBeNull()
  })

  it('lists distinct folders in order', () => {
    expect(distinctFolders([{ folder: 'b' }, { folder: 'a' }, { folder: '' }, { folder: null }, { folder: 'a' }])).toEqual(['a', 'b'])
  })
})

describe('where-used scanning', () => {
  const PAGE_WITH_HERO = {
    id: 3,
    title: 'Home',
    blocks: [
      { blockType: 'hero', backgroundImage: 7, heading: 'x' },
      { blockType: 'gallery', images: [7, 9] },
      { blockType: 'text', sortOrder: 7 },
    ],
    seo: { ogImage: { id: 7, url: '/x' } },
  }

  it('finds the id under picture-like keys only', () => {
    const paths = findMediaPaths(PAGE_WITH_HERO, 7)
    expect(paths).toContain('blocks.0.backgroundImage')
    expect(paths).toContain('blocks.1.images.0')
    expect(paths).toContain('seo.ogImage')
    expect(paths).not.toContain('blocks.2.sortOrder')
  })

  it('matches the populated object form and string ids', () => {
    expect(findMediaPaths({ logo: { id: 5 } }, 5)).toEqual(['logo'])
    expect(findMediaPaths({ logo: '5' }, 5)).toEqual(['logo'])
    expect(findMediaPaths({ logo: 6 }, 5)).toEqual([])
  })

  it('builds the edit link for collections and globals', () => {
    expect(editUrlFor({ kind: 'collection', slug: 'posts' }, 12, '/admin')).toBe('/admin/collections/posts/12')
    expect(editUrlFor({ kind: 'global', slug: 'site-settings' }, null, '/admin')).toBe('/admin/globals/site-settings')
  })

  it('combines direct where-lookups and the nested scan, deduplicated, and reports partial failures', async () => {
    const calls: Array<Record<string, unknown>> = []
    const engine: UsageEngine = {
      find: async (args) => {
        calls.push(args)
        if (args.collection === 'events') throw new Error('nope')
        if (args.collection === 'posts' && args.where) {
          return { docs: [{ id: 1, title: 'Post one' }] }
        }
        if (args.collection === 'posts') {
          return { docs: [{ id: 1, title: 'Post one', featuredImage: 7 }, { id: 2, title: 'Post two', body: { images: [7] } }] }
        }
        if (args.collection === 'pages') return { docs: [PAGE_WITH_HERO] }
        return { docs: [] }
      },
      findGlobal: async (args) => (args.slug === 'site-settings' ? { logo: 7 } : null),
    }
    const targets: UsageTarget[] = [
      { kind: 'collection', slug: 'posts', relationFields: ['featuredImage'] },
      { kind: 'collection', slug: 'events', relationFields: ['coverImage'] },
      { kind: 'collection', slug: 'pages' },
      { kind: 'global', slug: 'site-settings' },
    ]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = await scanMediaUsage(engine, 7, '/admin', targets)
    errorSpy.mockRestore()

    expect(calls.some((call) => call.where && (call.where as Record<string, unknown>).featuredImage)).toBe(true)
    expect(report.unchecked).toEqual(['events'])
    const keys = report.references.map((ref) => `${ref.collection}:${ref.id}:${ref.field}`)
    expect(keys).toContain('posts:1:featuredImage')
    expect(keys).toContain('posts:2:body.images.0')
    expect(keys).toContain('pages:3:blocks.0.backgroundImage')
    expect(keys).toContain('site-settings:null:logo')
    expect(keys.filter((key) => key === 'posts:1:featuredImage')).toHaveLength(1)
    expect(report.count).toBe(report.references.length)
  })
})

describe('delivery URLs with focal point, crop and versioning', () => {
  it('adds a height from the crop ratio and a focal gravity for a cropped fit', () => {
    const url = buildImageUrl(
      { url: '/api/media/file/a.jpg', width: 4000, height: 3000, focalX: 25, focalY: 80, crop: { ratio: '16:9' } },
      enabled,
      { width: 1600 },
    )
    expect(url).toContain('/cdn-cgi/image/')
    expect(url).toContain('width=1600')
    expect(url).toContain(`height=${Math.round(1600 / (16 / 9))}`)
    expect(url).toContain('fit=cover')
    expect(url).toContain('gravity=0.25x0.80')
  })

  it('leaves gravity out of a plain scale-down transform', () => {
    const params = buildTransformParams(enabled, { width: 800 }, focusFor({ focalX: 10, focalY: 10 }))
    expect(params).not.toContain('gravity=')
    expect(params).toContain('fit=scale-down')
  })

  it('maps crop presets and ignores free or unknown values', () => {
    expect(cropRatio('1:1')).toBe(1)
    expect(cropRatio('free')).toBeNull()
    expect(cropRatio('bogus')).toBeNull()
  })

  it('gives the CSS object-position only when a focal point is stored', () => {
    expect(objectPositionFor({ focalX: 30, focalY: 70 })).toBe('30% 70%')
    expect(objectPositionFor({})).toBeUndefined()
  })

  it('adds a version to plain URLs when the record changed, and leaves no-timestamp URLs alone', () => {
    expect(withVersion('/api/media/file/a.jpg', '2026-10-10T10:00:00.000Z')).toMatch(/\?v=\d+$/)
    expect(withVersion('/api/media/file/a.jpg?x=1', '2026-10-10T10:00:00.000Z')).toMatch(/&v=\d+$/)
    expect(withVersion('/api/media/file/a.jpg', null)).toBe('/api/media/file/a.jpg')
    expect(buildImageUrl({ url: '/api/media/file/a.jpg', updatedAt: '2026-10-10T10:00:00.000Z' }, DISABLED_CONFIG)).toMatch(/\?v=/)
  })
})

describe('stock normalisers', () => {
  it('normalises Openverse results and drops non-https links', () => {
    const photo = normaliseOpenverse({
      id: 'abc',
      title: 'Lake',
      url: 'https://live.example.org/lake.jpg',
      thumbnail: 'http://insecure.example.org/t.jpg',
      width: 1200,
      height: 800,
      creator: 'Ada',
      creator_url: 'https://example.org/ada',
      license: 'by-sa',
      license_version: '4.0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      foreign_landing_url: 'https://example.org/p/1',
    })
    expect(photo).toMatchObject({ id: 'abc', provider: 'openverse', thumb: 'https://live.example.org/lake.jpg', license: 'CC BY-SA 4.0', author: 'Ada' })
    expect(normaliseOpenverse({ id: 'x', url: 'http://no.example.org/x.jpg' })).toBeNull()
  })

  it('normalises Unsplash, Pexels and Pixabay results', () => {
    expect(
      normaliseUnsplash({
        id: 'u1',
        alt_description: 'Mountains',
        urls: { full: 'https://images.unsplash.com/f', small: 'https://images.unsplash.com/s' },
        user: { name: 'Sam', links: { html: 'https://unsplash.com/@sam' } },
        links: { html: 'https://unsplash.com/photos/u1', download_location: 'https://api.unsplash.com/photos/u1/download' },
      }),
    ).toMatchObject({ provider: 'unsplash', author: 'Sam', downloadLocation: 'https://api.unsplash.com/photos/u1/download', license: 'Unsplash License' })

    expect(normalisePexels({ id: 9, alt: 'Beach', src: { original: 'https://images.pexels.com/o.jpg', medium: 'https://images.pexels.com/m.jpg' }, photographer: 'Kim', photographer_url: 'https://www.pexels.com/@kim', url: 'https://www.pexels.com/photo/9' }))
      .toMatchObject({ id: '9', provider: 'pexels', full: 'https://images.pexels.com/o.jpg', license: 'Pexels License' })

    expect(normalisePixabay({ id: 77, tags: 'sea, sky', largeImageURL: 'https://cdn.pixabay.com/l.jpg', previewURL: 'https://cdn.pixabay.com/p.jpg', imageWidth: 3000, imageHeight: 2000, user: 'Lee', user_id: 5, pageURL: 'https://pixabay.com/photos/77' }))
      .toMatchObject({ id: '77', provider: 'pixabay', title: 'sea, sky', authorUrl: 'https://pixabay.com/users/Lee-5/' })
  })

  it('needs a key for keyed libraries and sends it in the right header', () => {
    expect(() => buildSearchRequest('unsplash', 'sea', 1, {})).toThrow(StockError)
    expect(buildSearchRequest('unsplash', 'sea', 1, { unsplash: 'KEY' }).headers.authorization).toBe('Client-ID KEY')
    expect(buildSearchRequest('pexels', 'sea', 2, { pexels: 'PK' }).headers.authorization).toBe('PK')
    expect(buildSearchRequest('openverse', 'sea', 1, {}).url).toContain('api.openverse.org/v1/images/?q=sea')
  })

  it('searches through the fetch it is given and maps errors to readable messages', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ total: 1, results: [{ id: 'a', url: 'https://live.example.org/a.jpg' }] }), { status: 200 }))
    const result = await searchStock('openverse', 'sea', 1, {}, ok as unknown as typeof fetch)
    expect(result.results).toHaveLength(1)

    const denied = vi.fn(async () => new Response('', { status: 401 }))
    await expect(searchStock('pexels', 'sea', 1, { pexels: 'k' }, denied as unknown as typeof fetch)).rejects.toThrow(/rejected the key/)
    const limited = vi.fn(async () => new Response('', { status: 429 }))
    await expect(searchStock('pixabay', 'sea', 1, { pixabay: 'k' }, limited as unknown as typeof fetch)).rejects.toMatchObject({ status: 429 })
  })
})

describe('import host and address checks', () => {
  it('flags private, local and literal addresses', () => {
    for (const host of ['localhost', 'printer.local', 'db.internal', '10.0.0.5', '127.0.0.1', '169.254.1.1', '192.168.1.9', '172.20.0.1', '[::1]', 'intranet']) {
      expect(isPrivateHostname(host), host).toBe(true)
    }
    expect(isPrivateHostname('images.unsplash.com')).toBe(false)
  })

  it('accepts only https, allow-listed hosts for the fixed providers', () => {
    expect(validateImportUrl('https://images.unsplash.com/a.jpg', ['images.unsplash.com']).hostname).toBe('images.unsplash.com')
    expect(() => validateImportUrl('http://images.unsplash.com/a.jpg', ['images.unsplash.com'])).toThrow(/https/)
    expect(() => validateImportUrl('https://evil.example.com/a.jpg', ['images.unsplash.com'])).toThrow(StockError)
    expect(() => validateImportUrl('https://10.1.2.3/a.jpg', OPENVERSE_IMAGE_HOSTS)).toThrow(StockError)
    expect(() => validateImportUrl('https://user:pw@images.unsplash.com/a.jpg', ['images.unsplash.com'])).toThrow(StockError)
  })

  it('takes Openverse pictures only from the address Openverse itself returns', async () => {
    const api = vi.fn(async () => new Response(JSON.stringify({ url: 'https://upload.wikimedia.org/w/file.jpg' }), { status: 200 }))
    const url = await resolveImportUrl({ provider: 'openverse', id: 'abc-1' }, {}, api as unknown as typeof fetch)
    expect(url.href).toBe('https://upload.wikimedia.org/w/file.jpg')
    expect((api.mock.calls as unknown as Array<[string]>)[0][0]).toBe('https://api.openverse.org/v1/images/abc-1/')
  })

  it('requires Unsplash download address and uses the one it returns', async () => {
    await expect(resolveImportUrl({ provider: 'unsplash', id: 'u1' }, { unsplash: 'K' })).rejects.toThrow(/download address/)
    const api = vi.fn(async () => new Response(JSON.stringify({ url: 'https://images.unsplash.com/photo-1.jpg' }), { status: 200 }))
    const url = await resolveImportUrl(
      { provider: 'unsplash', id: 'u1', downloadLocation: 'https://api.unsplash.com/photos/u1/download' },
      { unsplash: 'K' },
      api as unknown as typeof fetch,
    )
    expect(url.hostname).toBe('images.unsplash.com')
  })

  it('refuses a browser-supplied Pexels address outside its image host', async () => {
    await expect(resolveImportUrl({ provider: 'pexels', id: '1', full: 'https://attacker.example.com/x.jpg' }, {})).rejects.toThrow(StockError)
  })
})

describe('import download', () => {
  const url = new URL('https://images.unsplash.com/photo.jpg')

  it('downloads a JPEG within the limits', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }))
    const result = await fetchImportBytes(url, ['images.unsplash.com'], fetchImpl as unknown as typeof fetch)
    expect(result.mimeType).toBe('image/jpeg')
    expect(Array.from(result.data)).toEqual([1, 2, 3])
  })

  it('refuses SVG and other non-raster types', async () => {
    const fetchImpl = vi.fn(async () => new Response('<svg/>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }))
    await expect(fetchImportBytes(url, ['images.unsplash.com'], fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ status: 415 })
  })

  it('refuses an oversized declared length before reading', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(20 * 1024 * 1024) } }))
    await expect(fetchImportBytes(url, ['images.unsplash.com'], fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ status: 413 })
  })

  it('does not follow a redirect to a host outside the allow-list', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } }))
    await expect(fetchImportBytes(url, ['images.unsplash.com'], fetchImpl as unknown as typeof fetch)).rejects.toThrow(StockError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('names the stored file and alt text from the source', () => {
    expect(importFileName('pexels', '123', 'image/png')).toBe('pexels-123.png')
    expect(importAltText({ title: 'Sunset over the bay' })).toBe('Sunset over the bay')
    expect(importAltText({ author: 'Kim' })).toBe('Photo by Kim')
    expect(importAltText({ title: 'x'.repeat(200) }).length).toBeLessThanOrEqual(120)
  })
})
