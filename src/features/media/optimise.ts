/**
 * Stored optimisation for uploaded pictures, run through the Cloudflare Images
 * binding (`env.IMAGES`).
 *
 * This is the one place a picture's bytes are actually re-encoded. It is
 * separate from url.ts on purpose: url.ts changes what a visitor downloads
 * (transform on delivery, originals untouched), while this module writes a
 * smaller file back to R2 under the same name, so every existing link keeps
 * working.
 *
 * Everything here except `transformImageBytes` is pure. The binding is taken
 * as an interface so tests can supply a fake and the option builder can be
 * checked without Cloudflare.
 */

import type { MediaProvider } from './types'

/** The only input formats that are re-encoded. GIF (may be animated), SVG (a script-capable document) and PDF are never touched. */
export const OPTIMISABLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type OptimisableMimeType = (typeof OPTIMISABLE_MIME_TYPES)[number]

export type OutputMimeType = OptimisableMimeType | 'image/avif'

/** The shown message when the account has no Images binding. Kept here so the UI and the routes say the same thing. */
export const IMAGES_UNAVAILABLE_MESSAGE = 'Image transformations are not enabled on this account'

export function isOptimisableMimeType(mimeType: string | null | undefined): mimeType is OptimisableMimeType {
  if (typeof mimeType !== 'string') return false
  return (OPTIMISABLE_MIME_TYPES as readonly string[]).includes(mimeType.trim().toLowerCase())
}

/** Hard ceiling on one run, whatever the settings say - a Worker has a finite time and memory budget. */
export const MAX_BATCH_SIZE = 100

export type OptimiseSettings = {
  /** False when the provider is 'none': nothing is re-encoded on upload or by the bulk action. */
  enabled: boolean
  provider: MediaProvider
  quality: number
  convertToWebp: boolean
  convertToAvif: boolean
  stripMetadata: boolean
  maxWidth: number
  maxHeight: number
  /** When on, the untouched copy is kept under original/<filename> before it is replaced. */
  keepOriginals: boolean
  batchSize: number
}

const PROVIDERS: readonly MediaProvider[] = ['cloudflare-images', 'cloudflare-resizing', 'none']

const positiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

/**
 * Reads the raw `media-settings` global into the settled shape. Never throws:
 * a missing or half-filled global means "optimisation off", not an error.
 */
export function resolveOptimiseSettings(settings: unknown): OptimiseSettings {
  const raw = (settings ?? {}) as Record<string, Record<string, unknown> | undefined>
  const optimisation = raw.optimisation ?? {}
  const resizing = raw.resizing ?? {}
  const bulk = raw.bulk ?? {}

  const providerValue = typeof optimisation.provider === 'string' ? optimisation.provider.trim() : ''
  const provider: MediaProvider = (PROVIDERS as readonly string[]).includes(providerValue)
    ? (providerValue as MediaProvider)
    : 'none'

  return {
    enabled: provider !== 'none',
    provider,
    quality: Math.min(100, positiveInt(optimisation.quality, 82)),
    convertToWebp: optimisation.convertToWebp !== false,
    convertToAvif: optimisation.convertToAvif === true,
    stripMetadata: optimisation.stripMetadata !== false,
    maxWidth: positiveInt(resizing.maxWidth, 2560),
    maxHeight: positiveInt(resizing.maxHeight, 2560),
    keepOriginals: optimisation.keepOriginals === true,
    batchSize: Math.min(MAX_BATCH_SIZE, positiveInt(bulk.batchSize, 25)),
  }
}

/**
 * Which format the stored copy is written in. AVIF wins when switched on, then
 * WebP, otherwise the picture keeps its own format.
 */
export function chooseOutputMimeType(input: OptimisableMimeType, settings: OptimiseSettings): OutputMimeType {
  if (settings.convertToAvif) return 'image/avif'
  if (settings.convertToWebp) return 'image/webp'
  return input
}

export type OptimiseOptions = {
  width: number
  height: number
  /** `scale-down` never enlarges: a 400px picture stays 400px rather than being blown up. */
  fit: 'scale-down'
  format: OutputMimeType
  quality: number
  stripMetadata: boolean
}

/** Pure: settings and input format in, the transform the binding should run. */
export function buildOptimiseOptions(settings: OptimiseSettings, input: OptimisableMimeType): OptimiseOptions {
  return {
    width: settings.maxWidth,
    height: settings.maxHeight,
    fit: 'scale-down',
    format: chooseOutputMimeType(input, settings),
    quality: Math.min(100, Math.max(1, settings.quality)),
    stripMetadata: settings.stripMetadata,
  }
}

const EXTENSIONS: Record<OutputMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** A filename whose extension matches the new format. Unchanged when the format did not change. */
export function renameForMimeType(filename: string, mimeType: OutputMimeType): string {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  const current = dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
  const target = EXTENSIONS[mimeType]
  if (current === target || (target === 'jpg' && current === 'jpeg')) return filename
  return `${base}.${target}`
}

/** Output sizes for a picture that is already within the caps - used when the binding cannot report dimensions for the new format. */
export function scaledDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!width || !height) return { width, height }
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/* -------------------------------------------------------------------------- */
/* Animation                                                                  */
/* -------------------------------------------------------------------------- */

const ascii = (data: Uint8Array, offset: number, length: number): string => {
  let out = ''
  for (let i = 0; i < length; i++) out += String.fromCharCode(data[offset + i] ?? 0)
  return out
}

/**
 * True for a picture with more than one frame: an animated WebP (an `ANIM` or
 * `ANMF` chunk) or an APNG (an `acTL` chunk before the image data). Re-encoding
 * either keeps only the first frame, so they are left as they are.
 */
export function isAnimatedPicture(data: Uint8Array, mimeType: string | null | undefined): boolean {
  const type = (mimeType ?? '').toLowerCase()
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (type === 'image/webp') {
    if (data.byteLength < 12 || ascii(data, 0, 4) !== 'RIFF' || ascii(data, 8, 4) !== 'WEBP') return false
    let offset = 12
    while (offset + 8 <= data.byteLength) {
      const fourCC = ascii(data, offset, 4)
      if (fourCC === 'ANIM' || fourCC === 'ANMF') return true
      const size = view.getUint32(offset + 4, true)
      offset += 8 + size + (size % 2)
    }
    return false
  }
  if (type === 'image/png') {
    if (data.byteLength < 8 || ascii(data, 1, 3) !== 'PNG') return false
    let offset = 8
    while (offset + 8 <= data.byteLength) {
      const chunkType = ascii(data, offset + 4, 4)
      if (chunkType === 'acTL') return true
      if (chunkType === 'IDAT') return false
      offset += 12 + view.getUint32(offset, false)
    }
  }
  return false
}

/* -------------------------------------------------------------------------- */
/* The binding                                                                */
/* -------------------------------------------------------------------------- */

/** The part of the Cloudflare Images binding this module uses. Mirrors the runtime API so a real `env.IMAGES` satisfies it structurally. */
export interface ImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; height: number; fit: 'scale-down' }): {
      output(options: { format: OutputMimeType; quality: number }): Promise<{
        image(): ReadableStream<Uint8Array>
        contentType(): string
      }>
    }
  }
}

export type OptimisedBytes = { data: Uint8Array; mimeType: OutputMimeType }

/**
 * Runs one picture through the binding. Throws if the binding does; callers
 * decide whether that is a skipped picture or a failed one.
 */
export async function transformImageBytes(
  binding: ImagesBinding,
  data: Uint8Array,
  input: OptimisableMimeType,
  settings: OptimiseSettings,
): Promise<OptimisedBytes> {
  const options = buildOptimiseOptions(settings, input)
  const stream = new Blob([data as BlobPart]).stream() as ReadableStream<Uint8Array>
  const result = await binding
    .input(stream)
    .transform({ width: options.width, height: options.height, fit: options.fit })
    .output({ format: options.format, quality: options.quality })
  const bytes = new Uint8Array(await new Response(result.image()).arrayBuffer())
  const reported = result.contentType() as OutputMimeType
  const mimeType = (Object.keys(EXTENSIONS) as OutputMimeType[]).includes(reported) ? reported : options.format
  return { data: bytes, mimeType }
}

export type OptimiseOutcome =
  | { status: 'optimised'; data: Uint8Array; mimeType: OutputMimeType; originalSize: number; optimizedSize: number }
  | { status: 'kept'; reason: string; originalSize: number; optimizedSize: number }
  | { status: 'skipped'; reason: string }

/**
 * The decision: re-encode, and keep the original whenever the new copy is not
 * smaller. An optimisation that makes a file bigger is never written.
 */
export async function optimiseBytes(
  binding: ImagesBinding,
  data: Uint8Array,
  input: string | null | undefined,
  settings: OptimiseSettings,
): Promise<OptimiseOutcome> {
  if (!isOptimisableMimeType(input)) {
    return { status: 'skipped', reason: 'Only JPEG, PNG and WebP pictures are optimised. This file is kept as it is.' }
  }
  if (isAnimatedPicture(data, input)) {
    return { status: 'skipped', reason: 'Animated pictures are kept as they are, so no frames are lost.' }
  }
  const out = await transformImageBytes(binding, data, input, settings)
  if (out.data.byteLength >= data.byteLength) {
    return {
      status: 'kept',
      reason: 'The optimised copy was not smaller, so the original was kept.',
      originalSize: data.byteLength,
      optimizedSize: out.data.byteLength,
    }
  }
  return {
    status: 'optimised',
    data: out.data,
    mimeType: out.mimeType,
    originalSize: data.byteLength,
    optimizedSize: out.data.byteLength,
  }
}
