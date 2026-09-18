// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// Uploads stage: proves `createEngine()`'s new `file` support on
// create/update (`src/localapi/engine.ts`), the metadata computation it
// delegates to (`src/localapi/uploads.ts`), and the R2 storage wrapper it
// calls (`src/localapi/storage.ts`) all match real Payload's own upload
// handling for this app's one upload-enabled collection (`media`) - the
// same real-Payload-as-oracle pattern every other `localapi-*-parity`
// suite in this project already uses (see `localapi-richtext-parity.int.
// spec.ts`'s own header for the fullest statement of it), just at the
// engine/DB layer instead of rendered HTML.
//
// Every test uses a run-unique `marker` in its filenames (same technique
// `cms-db-media.int.spec.ts`'s own "cuts over cleanly" test already
// established) so concurrent/rerun test data never collides on the
// `filename` uniqueness this suite is partly testing.
//
// Format fixtures: the 1x1 PNG is the exact fixture `cms-db-media.int.spec.
// ts` already uses. The 1x1 GIF is a well-known, genuinely valid minimal
// GIF (GIF89a + global color table + one image block + a graphics control
// extension), not hand-approximated, so it exercises the same code path a
// real browser-exported GIF would. The JPEG is hand-built (SOI + a minimal
// JFIF APP0 + one SOF0 segment + EOI, no entropy-coded scan data) - both
// this app's own `probeJpeg` and real Payload's own dimension prober only
// ever read the SOF0 segment's own precision/height/width bytes to answer
// "how big is this image", so a syntactically-valid-but-undecodable JPEG is
// sufficient for parity purposes without needing a real photographic
// payload. WebP is NOT covered here - `src/localapi/uploads.ts`'s own
// `probeWebp` is exercised by hand-inspection against real Payload's
// storage-r2/plugin-cloud-storage ground truth instead (see that file's
// header), since none of this app's own real upload flows or test fixtures
// have ever produced a WebP file (confirmed by grep).
import type { RealEngine } from './helpers/realEngine'

import '@/engage.config'

import { getRealEngine as getEngine } from './helpers/realEngine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createEngine, type Engine } from '@/localapi/engine'
import { getMediaBucket, getMediaObjectResponse } from '@/localapi/storage'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/** A genuinely valid, decodable 1x1 transparent GIF (GIF89a, global color table, one graphics-control extension, one image block) - the same bytes commonly used as a minimal tracking-pixel fixture across the web. */
const onePixelGif = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64')

/** Builds a syntactically-valid JPEG containing only the markers a dimension prober reads: SOI, one minimal JFIF APP0, one baseline SOF0 (precision/height/width/component-count + 3x 3-byte component descriptors), EOI - no entropy-coded scan data, since neither this app's own `probeJpeg` nor a real dimension-only prober needs it. */
function buildMinimalJpeg(width: number, height: number): Buffer {
  const soi = [0xff, 0xd8]
  const app0 = [
    0xff, 0xe0, 0x00, 0x10, // marker, length (16)
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // version 1.1
    0x00, // units: none
    0x00, 0x01, 0x00, 0x01, // X/Y density
    0x00, 0x00, // thumbnail width/height
  ]
  const sof0 = [
    0xff, 0xc0, 0x00, 0x11, // marker, length (17)
    0x08, // precision
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, // 3 components
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]
  const eoi = [0xff, 0xd9]
  return Buffer.from([...soi, ...app0, ...sof0, ...eoi])
}

function svgFixture(width: number, height: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`, 'utf8')
}

describe('localapi/engine + localapi/uploads + localapi/storage - media upload parity vs real Payload', () => {
  let real: RealEngine
  let ours: Engine
  const marker = `upl${Date.now()}`
  const createdRealIds: number[] = []
  const createdOursIds: number[] = []

  beforeAll(async () => {
    real = await getEngine()
    ours = createEngine()
  })

  afterAll(async () => {
    for (const id of createdRealIds) {
      await real.delete({ collection: 'media', id }).catch((): undefined => undefined)
    }
    for (const id of createdOursIds) {
      await ours.delete({ collection: 'media', id, overrideAccess: true }).catch((): undefined => undefined)
    }
  })

  it('create without a file throws on both sides (a media doc always needs one)', async () => {
    await expect(ours.create({ collection: 'media', data: { alt: 'no file' }, overrideAccess: true })).rejects.toThrow()
    await expect(real.create({ collection: 'media', data: { alt: 'no file' } })).rejects.toThrow()
  })

  it('create with a PNG: filename/mimeType/filesize/width/height/url/thumbnailURL, and the bytes actually land in R2', async () => {
    const name = `${marker}-a.png`
    const created = await ours.create({
      collection: 'media',
      data: { alt: 'A' },
      file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length },
      overrideAccess: true,
    })
    createdOursIds.push(created.id as number)

    expect(created.filename).toBe(name)
    expect(created.mimeType).toBe('image/png')
    expect(created.filesize).toBe(onePixelPng.length)
    expect(created.width).toBe(1)
    expect(created.height).toBe(1)
    expect(created.url).toBe(`/api/media/file/${name}`)
    expect(created.thumbnailURL ?? null).toBeNull()

    const bucket = await getMediaBucket()
    const stored = await bucket.get(name)
    expect(stored).not.toBeNull()
    expect(Buffer.from(await stored!.arrayBuffer()).equals(onePixelPng)).toBe(true)
    expect(stored!.httpMetadata?.contentType).toBe('image/png')
  })

  it('filename dedup increments with a -1 suffix on collision, matching real Payload for the same collision', async () => {
    const name = `${marker}-dup.png`
    const first = await ours.create({ collection: 'media', data: { alt: 'dup1' }, file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length }, overrideAccess: true })
    const second = await ours.create({ collection: 'media', data: { alt: 'dup2' }, file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length }, overrideAccess: true })
    createdOursIds.push(first.id as number, second.id as number)
    expect(first.filename).toBe(name)
    expect(second.filename).toBe(`${marker}-dup-1.png`)

    const realName = `${marker}-dup-real.png`
    const realFirst = await real.create({ collection: 'media', data: { alt: 'dup1' }, file: { data: onePixelPng, mimetype: 'image/png', name: realName, size: onePixelPng.length } })
    const realSecond = await real.create({ collection: 'media', data: { alt: 'dup2' }, file: { data: onePixelPng, mimetype: 'image/png', name: realName, size: onePixelPng.length } })
    createdRealIds.push(realFirst.id, realSecond.id)
    expect(realSecond.filename).toBe(`${marker}-dup-real-1.png`)
  })

  it('rejects a restricted file type (an .html upload), matching real Payload', async () => {
    const html = Buffer.from('<html></html>')
    await expect(
      ours.create({ collection: 'media', data: { alt: 'bad' }, file: { data: html, mimetype: 'text/html', name: `${marker}-bad.html`, size: html.length }, overrideAccess: true }),
    ).rejects.toThrow()
    await expect(
      real.create({ collection: 'media', data: { alt: 'bad' }, file: { data: html, mimetype: 'text/html', name: `${marker}-bad-real.html`, size: html.length } }),
    ).rejects.toThrow()
  })

  it('JPEG dimensions match real Payload’s own prober', async () => {
    const jpeg = buildMinimalJpeg(10, 6)
    const created = await ours.create({ collection: 'media', data: { alt: 'jpeg' }, file: { data: jpeg, mimetype: 'image/jpeg', name: `${marker}-pic.jpg`, size: jpeg.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)
    const realCreated = await real.create({ collection: 'media', data: { alt: 'jpeg' }, file: { data: jpeg, mimetype: 'image/jpeg', name: `${marker}-pic-real.jpg`, size: jpeg.length } })
    createdRealIds.push(realCreated.id)

    expect(created.width).toBe(10)
    expect(created.height).toBe(6)
    expect(created.width).toBe(realCreated.width)
    expect(created.height).toBe(realCreated.height)
  })

  it('GIF dimensions match real Payload’s own prober', async () => {
    const created = await ours.create({ collection: 'media', data: { alt: 'gif' }, file: { data: onePixelGif, mimetype: 'image/gif', name: `${marker}-pic.gif`, size: onePixelGif.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)
    const realCreated = await real.create({ collection: 'media', data: { alt: 'gif' }, file: { data: onePixelGif, mimetype: 'image/gif', name: `${marker}-pic-real.gif`, size: onePixelGif.length } })
    createdRealIds.push(realCreated.id)

    expect(created.width).toBe(realCreated.width)
    expect(created.height).toBe(realCreated.height)
  })

  it('SVG dimensions (read from width/height attributes) match real Payload’s own prober', async () => {
    const svg = svgFixture(24, 32)
    const created = await ours.create({ collection: 'media', data: { alt: 'svg' }, file: { data: svg, mimetype: 'image/svg+xml', name: `${marker}-icon.svg`, size: svg.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)
    const realCreated = await real.create({ collection: 'media', data: { alt: 'svg' }, file: { data: svg, mimetype: 'image/svg+xml', name: `${marker}-icon-real.svg`, size: svg.length } })
    createdRealIds.push(realCreated.id)

    expect(created.width).toBe(realCreated.width)
    expect(created.height).toBe(realCreated.height)
  })

  it('update without a new file leaves the stored file and filename untouched', async () => {
    const name = `${marker}-keep.png`
    const created = await ours.create({ collection: 'media', data: { alt: 'keep v1' }, file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)

    const updated = await ours.update({ collection: 'media', id: created.id as number, data: { alt: 'keep v2' }, overrideAccess: true })
    expect(updated?.alt).toBe('keep v2')
    expect(updated?.filename).toBe(name)
    expect(updated?.url).toBe(created.url)

    const bucket = await getMediaBucket()
    expect(await bucket.get(name)).not.toBeNull()
  })

  it('update with a new file replaces the stored object and deletes the old one', async () => {
    const oldName = `${marker}-old.png`
    const created = await ours.create({ collection: 'media', data: { alt: 'replace' }, file: { data: onePixelPng, mimetype: 'image/png', name: oldName, size: onePixelPng.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)

    const newName = `${marker}-new.jpg`
    const jpeg = buildMinimalJpeg(4, 4)
    const updated = await ours.update({
      collection: 'media',
      id: created.id as number,
      data: {},
      file: { data: jpeg, mimetype: 'image/jpeg', name: newName, size: jpeg.length },
      overrideAccess: true,
    })
    expect(updated?.filename).toBe(newName)
    expect(updated?.mimeType).toBe('image/jpeg')
    expect(updated?.width).toBe(4)
    expect(updated?.height).toBe(4)
    expect(updated?.url).toBe(`/api/media/file/${newName}`)

    const bucket = await getMediaBucket()
    expect(await bucket.get(newName)).not.toBeNull()
    expect(await bucket.get(oldName)).toBeNull()
  })

  it('delete removes the stored R2 object', async () => {
    const name = `${marker}-del.png`
    const created = await ours.create({ collection: 'media', data: { alt: 'delete me' }, file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length }, overrideAccess: true })

    const bucket = await getMediaBucket()
    expect(await bucket.get(name)).not.toBeNull()

    await ours.delete({ collection: 'media', id: created.id as number, overrideAccess: true })
    expect(await bucket.get(name)).toBeNull()
  })

  it('getMediaObjectResponse serves back the exact stored bytes and content type', async () => {
    const name = `${marker}-serve.png`
    const created = await ours.create({ collection: 'media', data: { alt: 'serve' }, file: { data: onePixelPng, mimetype: 'image/png', name, size: onePixelPng.length }, overrideAccess: true })
    createdOursIds.push(created.id as number)

    const response = await getMediaObjectResponse(name, new Request(`http://localhost/api/media/file/${name}`))
    expect(response).not.toBeNull()
    expect(response!.status).toBe(200)
    expect(response!.headers.get('content-type')).toBe('image/png')
    expect(response!.headers.get('content-length')).toBe(String(onePixelPng.length))
    const bytes = Buffer.from(await response!.arrayBuffer())
    expect(bytes.equals(onePixelPng)).toBe(true)
  })

  it('getMediaObjectResponse returns null for a key that does not exist', async () => {
    const response = await getMediaObjectResponse(`${marker}-missing.png`, new Request('http://localhost/api/media/file/missing.png'))
    expect(response).toBeNull()
  })

  it('getMediaObjectResponse honors a byte-Range request (206, correct Content-Range, partial bytes)', async () => {
    // A bigger, non-image fixture so a partial range is meaningfully smaller
    // than the whole object (the 1x1 PNG fixture is only ~70 bytes).
    const payload = Buffer.from(`range-test-payload-${marker}-${'x'.repeat(200)}`)
    const name = `${marker}-range.bin`
    const created = await ours.create({
      collection: 'media',
      data: { alt: 'range' },
      file: { data: payload, mimetype: 'application/octet-stream', name, size: payload.length },
      overrideAccess: true,
    })
    createdOursIds.push(created.id as number)

    const request = new Request(`http://localhost/api/media/file/${name}`, { headers: { Range: 'bytes=5-14' } })
    const response = await getMediaObjectResponse(name, request)
    expect(response).not.toBeNull()
    expect(response!.status).toBe(206)
    expect(response!.headers.get('content-range')).toBe(`bytes 5-14/${payload.length}`)
    expect(response!.headers.get('content-length')).toBe('10')
    const bytes = Buffer.from(await response!.arrayBuffer())
    expect(bytes.equals(payload.subarray(5, 15))).toBe(true)
  })
})
