// @vitest-environment node
// Review hardening for the media library: upload guards, replacement and
// optimisation writes, stock import hosts, usage scan bounds, alt text and the
// folder listing. Storage is mocked; nothing touches R2 or D1.
import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  putMediaObject: vi.fn(async () => undefined),
  putOriginalIfMissing: vi.fn(async () => true),
  readMediaObject: vi.fn(async () => null as null | { data: Uint8Array; contentType: string }),
  deleteMediaObject: vi.fn(async () => undefined),
}))
vi.mock('@/localapi/storage', () => storage)

import { cleanAltText, collectMediaDocs, extensionNote, isCompatibleReplacement, optimiseStoredMedia, replaceStoredMedia, type StorageIO, type StoredMedia } from '@/features/media/library'
import { isAnimatedPicture, optimiseBytes, type ImagesBinding, type OptimiseSettings } from '@/features/media/optimise'
import type { PreparedUpload } from '@/features/media/uploadHook'
import { OPENVERSE_IMAGE_HOSTS, StockError, fetchImportBytes, hostMatches, isPrivateHostname, resolveImportUrl, validateImportUrl } from '@/features/media/stock'
import { SCAN_LIMIT, scanMediaUsage } from '@/features/media/usage'
import { ValidationError } from '@/localapi/operations'
import { generateUploadFields, isImageMimeType, normaliseMimeType, probeImageDimensions, type UploadFile } from '@/localapi/uploads'

const png = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
)
const bytes = (n: number) => new Uint8Array(n).fill(7)

const base: OptimiseSettings = {
  enabled: true,
  provider: 'cloudflare-images',
  quality: 82,
  convertToWebp: true,
  convertToAvif: false,
  stripMetadata: true,
  maxWidth: 2560,
  maxHeight: 2560,
  keepOriginals: false,
  batchSize: 25,
}

/** A binding that returns `out` for every transform. */
const binding = (out: Uint8Array): ImagesBinding => ({
  input: () => ({
    transform: () => ({
      output: async (options) => ({
        image: () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(out)
              controller.close()
            },
          }),
        contentType: () => options.format,
      }),
    }),
  }),
})

const file = (name: string, mimetype: string, data: Uint8Array = png): UploadFile => ({ name, mimetype, data, size: data.byteLength })

describe('upload type checks', () => {
  const generate = (upload: UploadFile) => generateUploadFields({ file: upload, filenameExists: async () => false })

  it('normalises the declared type before checking it', async () => {
    expect(normaliseMimeType('  Text/HTML ; charset=utf-8')).toBe('text/html')
    await expect(generate(file('page.txt', 'Text/HTML; charset=utf-8'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('page.txt', '  APPLICATION/XHTML+XML  '))).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses markup and script-capable types whatever the declared type is', async () => {
    await expect(generate(file('notes.html', 'image/png'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('notes.HTM', 'application/octet-stream'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('notes.xhtml', 'image/jpeg'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('feed.xml', 'image/png'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('logo.svgz', 'image/png'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('logo.svg', 'image/png', png))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('logo.png', 'image/svg+xml'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('data.bin', 'application/xml'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('data.bin', 'text/xml'))).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps the existing blocklist', async () => {
    await expect(generate(file('setup.exe', 'application/octet-stream'))).rejects.toBeInstanceOf(ValidationError)
    await expect(generate(file('tool.dmg', 'application/octet-stream'))).rejects.toBeInstanceOf(ValidationError)
  })

  it('accepts an ordinary picture and stores the normalised type', async () => {
    const fields = await generate(file('Harbour View.png', 'IMAGE/PNG; name=x'))
    expect(fields).toMatchObject({ filename: 'Harbour View.png', mimeType: 'image/png', width: 1, height: 1 })
  })

  it('refuses a name that sanitises to nothing, before anything is stored', async () => {
    const filenameExists = vi.fn(async () => false)
    await expect(generateUploadFields({ file: file('???.png', 'image/png'), filenameExists })).rejects.toBeInstanceOf(ValidationError)
    expect(filenameExists).not.toHaveBeenCalled()
  })

  it('reads AVIF dimensions from the ispe box, and accepts an AVIF without one', async () => {
    const ispe = [0, 0, 0, 20, 0x69, 0x73, 0x70, 0x65, 0, 0, 0, 0, 0, 0, 0x02, 0x80, 0, 0, 0x01, 0xe0]
    const avif = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, ...Array.from('avif', (c) => c.charCodeAt(0)), 0, 0, 0, 0, ...ispe])
    expect(isImageMimeType('image/avif')).toBe(true)
    expect(probeImageDimensions(avif, 'image/avif')).toEqual({ width: 640, height: 480 })
    const fields = await generate(file('scan.avif', 'image/avif', avif))
    expect(fields).toMatchObject({ mimeType: 'image/avif', width: 640, height: 480 })
    const bare = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, ...Array.from('avif', (c) => c.charCodeAt(0)), 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8])
    const withoutSize = await generate(file('bare.avif', 'image/avif', bare))
    expect(withoutSize.mimeType).toBe('image/avif')
    expect(withoutSize.width).toBeUndefined()
  })
})

describe('replacement', () => {
  it('allows picture for picture and PDF for PDF only, and never SVG', () => {
    expect(isCompatibleReplacement('image/jpeg', 'image/png')).toBe(true)
    expect(isCompatibleReplacement('IMAGE/PNG; x=1', 'image/webp')).toBe(true)
    expect(isCompatibleReplacement('application/pdf', 'application/pdf')).toBe(true)
    expect(isCompatibleReplacement('image/jpeg', 'application/pdf')).toBe(false)
    expect(isCompatibleReplacement('image/jpeg', 'image/svg+xml')).toBe(false)
    expect(isCompatibleReplacement('image/svg+xml', 'image/png')).toBe(false)
  })

  it('explains when the stored name keeps an extension that no longer matches', () => {
    expect(extensionNote('harbour.jpg', 'image/webp')).toMatch(/harbour\.jpg/)
    expect(extensionNote('harbour.jpg', 'image/jpeg')).toBeUndefined()
    expect(extensionNote('harbour.JPEG', 'image/jpeg')).toBeUndefined()
  })

  it('writes the row before the bytes, and puts the row back when the bytes fail', async () => {
    const calls: string[] = []
    const update = vi.fn(async (_id: number, _data: Record<string, unknown>) => {
      calls.push('db')
    })
    const io: StorageIO = {
      read: async () => ({ data: bytes(10), contentType: 'image/jpeg' }),
      put: vi.fn(async () => {
        calls.push('bytes')
        throw new Error('r2 unavailable')
      }),
      putOriginalIfMissing: vi.fn(async () => true),
    }
    const upload = file('new.png', 'image/png')
    const prepared: PreparedUpload = { file: upload, optimised: false, originalSize: png.byteLength, keepOriginal: null }
    const doc: StoredMedia = { id: 9, filename: 'harbour.jpg', mimeType: 'image/jpeg', filesize: 10, width: 5, height: 6, originalSize: 10, optimizedSize: null }
    await expect(replaceStoredMedia(doc, upload, prepared, { ...base, enabled: false }, update, io)).rejects.toThrow('r2 unavailable')
    expect(calls).toEqual(['db', 'bytes', 'db'])
    expect(update.mock.calls[1]?.[1]).toMatchObject({ mimeType: 'image/jpeg', filesize: 10, width: 5, height: 6 })
  })

  it('refuses a replacement whose name sanitises to nothing before any write', async () => {
    const update = vi.fn(async (_id: number, _data: Record<string, unknown>) => undefined)
    const io: StorageIO = { read: async () => null, put: vi.fn(async () => undefined), putOriginalIfMissing: vi.fn(async () => true) }
    const upload = file('???.png', 'image/png')
    const prepared: PreparedUpload = { file: upload, optimised: false, originalSize: png.byteLength, keepOriginal: null }
    await expect(replaceStoredMedia({ id: 1, filename: 'a.png', mimeType: 'image/png' }, upload, prepared, base, update, io)).rejects.toBeInstanceOf(ValidationError)
    expect(update).not.toHaveBeenCalled()
    expect(io.put).not.toHaveBeenCalled()
  })
})

describe('optimisation', () => {
  const doc: StoredMedia = { id: 4, filename: 'harbour.jpg', mimeType: 'image/jpeg', filesize: 1000, width: null, height: null, originalSize: null, optimizedSize: null }
  const io = (): StorageIO => ({ read: async () => ({ data: bytes(1000), contentType: 'image/jpeg' }), put: vi.fn(async () => undefined), putOriginalIfMissing: vi.fn(async () => true) })

  it('skips a picture that is already optimised unless forced', async () => {
    const transform = vi.fn(() => {
      throw new Error('should not run')
    })
    const sentinel: ImagesBinding = { input: () => ({ transform: transform as never }) }
    const already = { ...doc, optimizedSize: 200 }
    const skipped = await optimiseStoredMedia(already, base, sentinel, vi.fn(async () => undefined), io())
    expect(skipped).toMatchObject({ status: 'skipped' })
    expect(transform).not.toHaveBeenCalled()

    const forced = await optimiseStoredMedia(already, base, binding(bytes(200)), vi.fn(async () => undefined), io(), { force: true })
    expect(forced).toMatchObject({ status: 'optimised', after: 200 })
  })

  it('restores the row when the rewritten bytes cannot be stored', async () => {
    const update = vi.fn(async (_id: number, _data: Record<string, unknown>) => undefined)
    const failing: StorageIO = { ...io(), put: vi.fn(async () => { throw new Error('r2 down') }) }
    const result = await optimiseStoredMedia(doc, base, binding(bytes(200)), update, failing)
    expect(result).toMatchObject({ status: 'failed' })
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0]?.[1]).toMatchObject({ mimeType: 'image/webp', optimizedSize: 200 })
    expect(update.mock.calls[1]?.[1]).toMatchObject({ mimeType: 'image/jpeg', filesize: 1000, optimizedSize: null })
  })

  it('explains when a WebP is stored under a .jpg name', async () => {
    const result = await optimiseStoredMedia(doc, base, binding(bytes(200)), vi.fn(async () => undefined), io())
    expect(result.status).toBe('optimised')
    expect(result.note).toMatch(/harbour\.jpg/)
  })

  it('leaves animated WebP and APNG alone, without calling the binding', async () => {
    const webp = Uint8Array.from([
      ...Array.from('RIFF', (c) => c.charCodeAt(0)), 0, 0, 0, 0, ...Array.from('WEBP', (c) => c.charCodeAt(0)),
      ...Array.from('VP8X', (c) => c.charCodeAt(0)), 10, 0, 0, 0, ...new Uint8Array(10),
      ...Array.from('ANIM', (c) => c.charCodeAt(0)), 6, 0, 0, 0, ...new Uint8Array(6),
    ])
    const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...Array.from(type, (c) => c.charCodeAt(0)), ...data, 0, 0, 0, 0]
    const apng = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', new Array(13).fill(0)), ...chunk('acTL', [0, 0, 0, 2, 0, 0, 0, 0]), ...chunk('IDAT', [1])])
    expect(isAnimatedPicture(webp, 'image/webp')).toBe(true)
    expect(isAnimatedPicture(apng, 'image/png')).toBe(true)
    expect(isAnimatedPicture(png, 'image/png')).toBe(false)

    const transform = vi.fn()
    const sentinel: ImagesBinding = { input: () => ({ transform: transform as never }) }
    const webpOutcome = await optimiseBytes(sentinel, webp, 'image/webp', base)
    const apngOutcome = await optimiseBytes(sentinel, apng, 'image/png', base)
    expect(webpOutcome.status).toBe('skipped')
    expect(apngOutcome.status).toBe('skipped')
    expect(transform).not.toHaveBeenCalled()
  })
})

describe('stock import hosts', () => {
  it('allows only the listed Openverse hosts, and subdomains for wildcard entries', () => {
    expect(validateImportUrl('https://upload.wikimedia.org/a.jpg', OPENVERSE_IMAGE_HOSTS).hostname).toBe('upload.wikimedia.org')
    expect(validateImportUrl('https://live.staticflickr.com/a.jpg', OPENVERSE_IMAGE_HOSTS).hostname).toBe('live.staticflickr.com')
    expect(validateImportUrl('https://farm5.staticflickr.com/a.jpg', OPENVERSE_IMAGE_HOSTS).hostname).toBe('farm5.staticflickr.com')
    expect(hostMatches('staticflickr.com', '*.staticflickr.com')).toBe(false)
    expect(hostMatches('staticflickr.com.evil.example', '*.staticflickr.com')).toBe(false)
  })

  it('refuses hosts outside the list, including i.pinimg.com', () => {
    expect(() => validateImportUrl('https://i.pinimg.com/a.jpg', OPENVERSE_IMAGE_HOSTS)).toThrow(StockError)
    expect(() => validateImportUrl('https://example.org/a.jpg', OPENVERSE_IMAGE_HOSTS)).toThrow(StockError)
  })

  it('refuses wildcard DNS names and IP-looking labels', () => {
    expect(isPrivateHostname('evil.nip.io')).toBe(true)
    expect(isPrivateHostname('1.2.3.4.sslip.io')).toBe(true)
    expect(isPrivateHostname('app.localtest.me')).toBe(true)
    expect(isPrivateHostname('3232235777.example.com')).toBe(true)
    expect(isPrivateHostname('ip-10-0-0-1.example.com')).toBe(true)
    expect(isPrivateHostname('upload.wikimedia.org')).toBe(false)
    expect(() => validateImportUrl('https://a.10.0.0.1.nip.io/a.jpg', OPENVERSE_IMAGE_HOSTS)).toThrow(StockError)
  })

  it('re-checks a redirect target against the same list', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://i.pinimg.com/x.jpg' } }))
    await expect(fetchImportBytes(new URL('https://upload.wikimedia.org/a.jpg'), OPENVERSE_IMAGE_HOSTS, fetchImpl as unknown as typeof fetch)).rejects.toThrow(StockError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refuses an Openverse answer that points at a host outside the list', async () => {
    const api = vi.fn(async () => new Response(JSON.stringify({ url: 'https://i.pinimg.com/x.jpg' }), { status: 200 }))
    await expect(resolveImportUrl({ provider: 'openverse', id: 'abc' }, {}, api as unknown as typeof fetch)).rejects.toThrow(StockError)
  })
})

describe('usage scan bounds', () => {
  const engine = (totalDocs: number) => ({
    find: vi.fn(async (args: Record<string, unknown>) => ({ docs: [], totalDocs: args.where === undefined ? totalDocs : 0 })),
    findGlobal: vi.fn(async () => null),
  })

  it('reads at most 200 documents per collection and reports the collection as truncated', async () => {
    expect(SCAN_LIMIT).toBe(200)
    const fake = engine(250)
    const report = await scanMediaUsage(fake, 501, '/admin-usage-cap')
    expect(report.truncated).toContain('posts')
    const scanCalls = fake.find.mock.calls.filter(([args]) => (args as { where?: unknown }).where === undefined)
    expect(scanCalls.every(([args]) => (args as { limit: number }).limit === 200)).toBe(true)
  })

  it('reuses a report for the same media id within 60 seconds', async () => {
    const fake = engine(0)
    await scanMediaUsage(fake, 502, '/admin-usage-cache')
    const afterFirst = fake.find.mock.calls.length
    await scanMediaUsage(fake, 502, '/admin-usage-cache')
    expect(fake.find.mock.calls.length).toBe(afterFirst)
    await scanMediaUsage(fake, 503, '/admin-usage-cache')
    expect(fake.find.mock.calls.length).toBeGreaterThan(afterFirst)
  })
})

describe('alt text and folder listing', () => {
  it('strips control characters and keeps alt text to 125 characters', () => {
    expect(cleanAltText('  A dog\u0007 on\nthe\tbeach  ')).toBe('A dog on the beach')
    const long = cleanAltText('word '.repeat(100))
    expect(long.length).toBeLessThanOrEqual(125)
    expect(long.endsWith(' ')).toBe(false)
  })

  const pager = (total: number) =>
    vi.fn(async (page: number, limit: number) => {
      const start = (page - 1) * limit
      const count = Math.max(0, Math.min(limit, total - start))
      return { docs: Array.from({ length: count }, (_, i) => ({ id: start + i })) }
    })

  it('pages through the whole library', async () => {
    const findPage = pager(1200)
    const result = await collectMediaDocs(findPage)
    expect(result.docs).toHaveLength(1200)
    expect(result.truncated).toBe(false)
    expect(findPage).toHaveBeenCalledTimes(3)
  })

  it('stops at 5000 documents and reports truncated', async () => {
    const result = await collectMediaDocs(pager(6000))
    expect(result.docs).toHaveLength(5000)
    expect(result.truncated).toBe(true)
  })

  it('is not truncated at exactly one full page', async () => {
    const result = await collectMediaDocs(pager(500))
    expect(result.docs).toHaveLength(500)
    expect(result.truncated).toBe(false)
  })
})
