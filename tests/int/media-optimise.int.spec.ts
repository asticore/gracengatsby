// @vitest-environment node
// Optimise-on-upload and in-place optimisation, with the Cloudflare Images
// binding replaced by a fake. Storage is mocked: nothing touches R2 or D1.
import { describe, expect, it, vi } from 'vitest'

const storage = vi.hoisted(() => ({
  putMediaObject: vi.fn(async () => undefined),
  putOriginalIfMissing: vi.fn(async () => true),
  readMediaObject: vi.fn(async () => null as null | { data: Uint8Array; contentType: string }),
  deleteMediaObject: vi.fn(async () => undefined),
}))
vi.mock('@/localapi/storage', () => storage)

import {
  buildOptimiseOptions,
  chooseOutputMimeType,
  isOptimisableMimeType,
  optimiseBytes,
  renameForMimeType,
  resolveOptimiseSettings,
  type ImagesBinding,
  type OptimiseSettings,
} from '@/features/media/optimise'
import { optimiseStoredMedia, isCompatibleReplacement, replaceStoredMedia } from '@/features/media/library'
import { prepareUploadFile } from '@/features/media/uploadHook'
import type { UploadFile } from '@/localapi/uploads'
import type { PreparedUpload } from '@/features/media/uploadHook'

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

/** A fake binding that records each call and returns `output` bytes in `format`. */
function fakeBinding(output: Uint8Array, contentType?: string) {
  const calls: Array<{ transform: unknown; output: unknown }> = []
  const binding: ImagesBinding = {
    input: () => ({
      transform: (transform) => ({
        output: async (outputOptions) => {
          calls.push({ transform, output: outputOptions })
          return {
            image: () =>
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(output)
                  controller.close()
                },
              }),
            contentType: () => contentType ?? outputOptions.format,
          }
        },
      }),
    }),
  }
  return { binding, calls }
}

const bytes = (length: number, fill = 7) => new Uint8Array(length).fill(fill)

describe('resolveOptimiseSettings', () => {
  it('is disabled when the provider is none or missing', () => {
    expect(resolveOptimiseSettings(null).enabled).toBe(false)
    expect(resolveOptimiseSettings({ optimisation: { provider: 'none' } }).enabled).toBe(false)
    expect(resolveOptimiseSettings({ optimisation: { provider: 'bogus' } }).provider).toBe('none')
  })

  it('reads the stored values and applies the defaults', () => {
    const settings = resolveOptimiseSettings({
      optimisation: { provider: 'cloudflare-images', quality: 70, convertToAvif: true, keepOriginals: true },
      resizing: { maxWidth: 1600, maxHeight: 1200 },
      bulk: { batchSize: 500 },
    })
    expect(settings).toMatchObject({
      enabled: true,
      quality: 70,
      convertToAvif: true,
      convertToWebp: true,
      stripMetadata: true,
      keepOriginals: true,
      maxWidth: 1600,
      maxHeight: 1200,
      batchSize: 100,
    })
  })

  it('treats keepOriginals as off unless it is explicitly on', () => {
    expect(resolveOptimiseSettings({ optimisation: { provider: 'cloudflare-images' } }).keepOriginals).toBe(false)
  })
})

describe('format and option builder', () => {
  it('prefers AVIF, then WebP, then the original format', () => {
    expect(chooseOutputMimeType('image/jpeg', { ...base, convertToAvif: true })).toBe('image/avif')
    expect(chooseOutputMimeType('image/png', base)).toBe('image/webp')
    expect(chooseOutputMimeType('image/png', { ...base, convertToWebp: false })).toBe('image/png')
  })

  it('builds a scale-down transform capped at the configured size', () => {
    expect(buildOptimiseOptions({ ...base, maxWidth: 1000, maxHeight: 800, quality: 150 }, 'image/jpeg')).toEqual({
      width: 1000,
      height: 800,
      fit: 'scale-down',
      format: 'image/webp',
      quality: 100,
      stripMetadata: true,
    })
  })

  it('only accepts JPEG, PNG and WebP as input', () => {
    expect(isOptimisableMimeType('image/jpeg')).toBe(true)
    expect(isOptimisableMimeType('image/webp')).toBe(true)
    expect(isOptimisableMimeType('image/svg+xml')).toBe(false)
    expect(isOptimisableMimeType('image/gif')).toBe(false)
    expect(isOptimisableMimeType('application/pdf')).toBe(false)
    expect(isOptimisableMimeType(null)).toBe(false)
  })

  it('renames the file only when the format changes', () => {
    expect(renameForMimeType('holiday.jpg', 'image/webp')).toBe('holiday.webp')
    expect(renameForMimeType('holiday.JPEG', 'image/jpeg')).toBe('holiday.JPEG')
    expect(renameForMimeType('holiday', 'image/avif')).toBe('holiday.avif')
  })
})

describe('optimiseBytes', () => {
  it('writes the smaller copy and reports both sizes', async () => {
    const { binding, calls } = fakeBinding(bytes(300))
    const outcome = await optimiseBytes(binding, bytes(1000), 'image/jpeg', base)
    expect(outcome).toMatchObject({ status: 'optimised', mimeType: 'image/webp', originalSize: 1000, optimizedSize: 300 })
    expect(calls[0]).toMatchObject({ transform: { width: 2560, height: 2560, fit: 'scale-down' }, output: { format: 'image/webp', quality: 82 } })
  })

  it('keeps the original when the new copy is not smaller', async () => {
    const { binding } = fakeBinding(bytes(1200))
    const outcome = await optimiseBytes(binding, bytes(1000), 'image/png', base)
    expect(outcome.status).toBe('kept')
  })

  it('skips formats it must not touch without calling the binding', async () => {
    const { binding, calls } = fakeBinding(bytes(10))
    const outcome = await optimiseBytes(binding, bytes(1000), 'image/gif', base)
    expect(outcome.status).toBe('skipped')
    expect(calls).toHaveLength(0)
  })
})

describe('prepareUploadFile (optimise on upload)', () => {
  const upload: UploadFile = { data: bytes(1000), mimetype: 'image/jpeg', name: 'Harbour.jpg', size: 1000 }

  it('stores the optimised copy under a matching name and keeps the original when asked', async () => {
    const { binding } = fakeBinding(bytes(250))
    const prepared = await prepareUploadFile(upload, {
      readSettings: async () => ({ ...base, keepOriginals: true }),
      binding: async () => binding,
    })
    expect(prepared.optimised).toBe(true)
    expect(prepared.file).toMatchObject({ name: 'Harbour.webp', mimetype: 'image/webp', size: 250 })
    expect(prepared.originalSize).toBe(1000)
    expect(prepared.keepOriginal).toEqual({ data: upload.data, mimetype: 'image/jpeg' })
  })

  it('stores the upload as sent, with a reason, when no Images binding exists', async () => {
    const prepared = await prepareUploadFile(upload, {
      readSettings: async () => base,
      binding: async () => null,
    })
    expect(prepared.optimised).toBe(false)
    expect(prepared.file).toBe(upload)
    expect(prepared.skipped).toBe('Image transformations are not enabled on this account')
  })

  it('does nothing when optimisation is off', async () => {
    const prepared = await prepareUploadFile(upload, {
      readSettings: async () => ({ ...base, enabled: false }),
      binding: async () => fakeBinding(bytes(1)).binding,
    })
    expect(prepared.optimised).toBe(false)
    expect(prepared.skipped).toBeUndefined()
  })

  it('never fails the upload when the binding throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: ImagesBinding = {
      input: () => ({
        transform: () => ({
          output: async (): Promise<never> => {
            throw new Error('boom')
          },
        }),
      }),
    }
    const prepared = await prepareUploadFile(upload, { readSettings: async () => base, binding: async () => broken })
    expect(prepared.optimised).toBe(false)
    expect(prepared.file).toBe(upload)
    errorSpy.mockRestore()
  })
})

describe('optimiseStoredMedia (in place)', () => {
  const doc = { id: 4, filename: 'harbour.jpg', mimeType: 'image/jpeg', filesize: 1000, width: 4000, height: 3000, originalSize: null as number | null }

  it('rewrites the same key, keeps the first original, and records both sizes', async () => {
    const { binding } = fakeBinding(bytes(200))
    const put = vi.fn(async () => undefined)
    const update = vi.fn(async () => undefined)
    const io = {
      read: async () => ({ data: bytes(1000), contentType: 'image/jpeg' }),
      put,
      putOriginalIfMissing: vi.fn(async () => true),
    }
    const result = await optimiseStoredMedia(doc, { ...base, keepOriginals: true }, binding, update, io)
    expect(result).toMatchObject({ status: 'optimised', before: 1000, after: 200 })
    expect(io.putOriginalIfMissing).toHaveBeenCalledWith('harbour.jpg', expect.any(Uint8Array), 'image/jpeg')
    expect(put).toHaveBeenCalledWith('harbour.jpg', expect.any(Uint8Array), 'image/webp')
    expect(update).toHaveBeenCalledWith(4, expect.objectContaining({ mimeType: 'image/webp', filesize: 200, originalSize: 1000, optimizedSize: 200 }))
  })

  it('does not keep an original when keepOriginals is off', async () => {
    const { binding } = fakeBinding(bytes(200))
    const io = { read: async () => ({ data: bytes(1000), contentType: 'image/jpeg' }), put: vi.fn(async () => undefined), putOriginalIfMissing: vi.fn(async () => true) }
    await optimiseStoredMedia(doc, base, binding, vi.fn(async () => undefined), io)
    expect(io.putOriginalIfMissing).not.toHaveBeenCalled()
  })

  it('reports a failure and leaves storage alone when the file is missing', async () => {
    const { binding } = fakeBinding(bytes(200))
    const put = vi.fn(async () => undefined)
    const io = { read: async (): Promise<null> => null, put, putOriginalIfMissing: vi.fn(async () => true) }
    const result = await optimiseStoredMedia(doc, base, binding, vi.fn(async () => undefined), io)
    expect(result.status).toBe('failed')
    expect(put).not.toHaveBeenCalled()
  })
})

describe('replaceStoredMedia', () => {
  // A 1x1 PNG, so the real dimension probe has something to read.
  const png = Uint8Array.from(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  )

  it('keeps the stored filename and writes the new bytes under it', async () => {
    const file: UploadFile = { data: png, mimetype: 'image/png', name: 'new-photo.png', size: png.byteLength }
    const prepared: PreparedUpload = { file, optimised: false, originalSize: png.byteLength, keepOriginal: null }
    const put = vi.fn(async () => undefined)
    const update = vi.fn(async () => undefined)
    const io = { read: async () => ({ data: bytes(10), contentType: 'image/jpeg' }), put, putOriginalIfMissing: vi.fn(async () => true) }
    const result = await replaceStoredMedia(
      { id: 9, filename: 'harbour.jpg', mimeType: 'image/jpeg', filesize: 10 },
      file,
      prepared,
      { ...base, keepOriginals: true, enabled: false },
      update,
      io,
    )
    expect(put).toHaveBeenCalledWith('harbour.jpg', png, 'image/png')
    expect(io.putOriginalIfMissing).toHaveBeenCalledWith('harbour.jpg', expect.any(Uint8Array), 'image/jpeg')
    expect(result).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 })
    expect(update).toHaveBeenCalledWith(9, expect.objectContaining({ mimeType: 'image/png', filesize: png.byteLength }))
  })

  it('allows picture for picture and PDF for PDF only', () => {
    expect(isCompatibleReplacement('image/jpeg', 'image/png')).toBe(true)
    expect(isCompatibleReplacement('application/pdf', 'application/pdf')).toBe(true)
    expect(isCompatibleReplacement('image/jpeg', 'application/pdf')).toBe(false)
    expect(isCompatibleReplacement('application/pdf', 'image/png')).toBe(false)
  })
})
