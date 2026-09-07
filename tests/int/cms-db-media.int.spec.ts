// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
import type { Engine } from '@/engine'

import '@/engage.config'

import { getEngine } from '@/engine'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createMedia, deleteMedia, findMediaByID, updateMedia } from '@/cms/db'

// A real, minimal 1x1 transparent PNG - Payload's local API needs an actual
// decodable image for an upload-enabled collection's `file` option (it reads
// width/height itself), a bare `Buffer.from('x')` is not enough.
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

/**
 * Phase 12: Media, this app's only upload-enabled collection. Unlike every
 * other collection this data layer models, Media's interesting columns
 * (`url`, `thumbnailURL`, `filename`, `mimeType`, `filesize`, `width`,
 * `height`) are NOT declared in its own `fields` - they are Payload's own
 * implicit upload columns (see ../../src/cms/db/schema/generate.ts's
 * hasUpload/uploadColumns doc comment), so "write a document Payload can
 * read back" here means going through a REAL upload (Payload's Local API
 * `file` option, backed by this app's real R2 binding in local dev - see
 * src/engine/storage.ts) rather than plain `data`, otherwise this suite
 * would only prove `alt` round-trips and never touch the columns Phase 12
 * actually added.
 */
describe('cms/db - media (proof of concept, not wired in)', () => {
  let engine: Engine
  const createdIds: number[] = []

  beforeAll(async () => {
    engine = await getEngine()
  })

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteMedia(id)
    }
  })

  it('reads a real uploaded document written by Payload: url/filename/mimeType/filesize/width/height', async () => {
    const created = await engine.create({
      collection: 'media',
      data: { alt: 'Parity image A' },
      file: { data: onePixelPng, mimetype: 'image/png', name: 'parity-a.png', size: onePixelPng.length },
    })
    createdIds.push(created.id as number)

    const viaOurs = await findMediaByID(created.id as number)
    expect(viaOurs?.alt).toBe('Parity image A')
    expect(viaOurs?.url).toBe(created.url)
    expect(viaOurs?.filename).toBe('parity-a.png')
    expect(viaOurs?.mimeType).toBe('image/png')
    expect(viaOurs?.filesize).toBe(onePixelPng.length)
    expect(viaOurs?.width).toBe(1)
    expect(viaOurs?.height).toBe(1)
    // Real Payload leaves this null with no imageSizes/focalPoint configured
    // (see Media.ts's `upload: { crop: false, focalPoint: false }`) -
    // confirmed against a real created doc, not assumed.
    expect(viaOurs?.thumbnailURL).toBeNull()
  })

  it('writes a document (upload columns included) Payload can read back', async () => {
    const ours = await createMedia({
      alt: 'Written by clone adapter',
      url: '/api/media/file/clone-written.png',
      filename: 'clone-written.png',
      mimeType: 'image/png',
      filesize: 12345,
      width: 200,
      height: 100,
    })
    createdIds.push(ours.id)
    expect(ours.filename).toBe('clone-written.png')

    const viaPayload = await engine.findByID({ collection: 'media', id: ours.id })
    expect(viaPayload.alt).toBe('Written by clone adapter')
    expect(viaPayload.filename).toBe('clone-written.png')
    expect(viaPayload.mimeType).toBe('image/png')
    expect(viaPayload.filesize).toBe(12345)
    expect(viaPayload.width).toBe(200)
    expect(viaPayload.height).toBe(100)
  })

  it('updates and deletes through the clone adapter', async () => {
    const ours = await createMedia({ alt: 'Temp' })
    createdIds.push(ours.id)

    const updated = await updateMedia(ours.id, { alt: 'Temp, updated' })
    expect(updated?.alt).toBe('Temp, updated')

    const viaPayload = await engine.findByID({ collection: 'media', id: ours.id })
    expect(viaPayload.alt).toBe('Temp, updated')

    const deleted = await deleteMedia(ours.id)
    expect(deleted).toBe(true)
    await expect(engine.findByID({ collection: 'media', id: ours.id })).rejects.toThrow()

    createdIds.splice(createdIds.indexOf(ours.id), 1)
  })
})
