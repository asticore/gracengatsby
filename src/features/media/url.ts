/**
 * Turns a stored R2 media record into a delivery URL that carries the
 * configured transformations.
 *
 * WHY THIS IS A URL BUILDER AND NOT AN IMAGE PIPELINE
 * ---------------------------------------------------
 * `sharp` does not run on Workers - it is a native binary, and it is the reason
 * crop and focal point are switched off on the Media collection. So there is no
 * point in this codebase where we can decode a JPEG, resize it and write a
 * smaller file back to R2. Every ShortPixel/Smush-style "re-encode on upload"
 * approach is therefore off the table on this stack.
 *
 * What IS available is transform-on-delivery: Cloudflare re-encodes the image
 * as it leaves the edge, driven entirely by parameters in the URL, and caches
 * the result. The originals in R2 are never touched. That makes the derived
 * image a pure function of (record, settings), which is why nothing here is
 * persisted - see the bulk route for what "re-optimise" means under that model.
 *
 * Everything in this file is pure and engine-free so it can be unit tested.
 */

import type { DeliveryFormat, ImageRequest, MediaConfig, MediaLike, ResolvedImage } from './types'

/**
 * The safe answer to every question when media optimisation is off or
 * misconfigured. Non-zero numbers so callers that read them for clamping still
 * behave sensibly.
 */
export const DISABLED_CONFIG: MediaConfig = {
  enabled: false,
  provider: 'none',
  quality: 82,
  format: 'original',
  stripMetadata: false,
  maxWidth: 2560,
  maxHeight: 2560,
  responsiveWidths: [],
  deliveryPrefix: '',
  batchSize: 25,
}

/** Already-transformed URLs must not be transformed again. */
const RESIZING_SEGMENT = '/cdn-cgi/image/'

/** Formats that cannot be re-encoded, so asking for WebP would only corrupt them. */
const UNTRANSFORMABLE = new Set(['image/svg+xml', 'image/gif', 'application/pdf'])

const isTransformable = (media: MediaLike): boolean =>
  !media.mimeType || !UNTRANSFORMABLE.has(media.mimeType)

/** Nothing may be requested wider than the configured cap. */
export const clampWidth = (width: number, config: MediaConfig): number =>
  Math.max(1, Math.min(Math.round(width), config.maxWidth))

const formatParam = (format: DeliveryFormat): string | null =>
  format === 'original' ? null : `format=${format}`

/**
 * The comma-separated option list both Cloudflare products read - Image
 * Resizing takes it as a path segment, Cloudflare Images as a flexible
 * variant. The option names are identical between the two, which is the only
 * reason one builder can serve both.
 */
export function buildTransformParams(config: MediaConfig, request: ImageRequest = {}): string {
  const fit = request.fit ?? 'scale-down'
  const parts: string[] = []

  // An explicit width still gets clamped: max width is enforced on the way out,
  // not on the way in, because the original in R2 is never resized.
  parts.push(`width=${clampWidth(request.width ?? config.maxWidth, config)}`)

  if (request.height) {
    parts.push(`height=${Math.max(1, Math.round(request.height))}`)
  } else if (fit === 'scale-down' || fit === 'contain') {
    // With a non-cropping fit, width and height are a bounding box, so this
    // caps height without changing the aspect ratio. Skipped for cover/crop,
    // where a height would silently start cutting the picture up.
    parts.push(`height=${config.maxHeight}`)
  }

  parts.push(`fit=${fit}`)
  parts.push(`quality=${config.quality}`)

  const format = formatParam(config.format)
  if (format) parts.push(format)

  // The only metadata-stripping lever available on this stack. `copyright`
  // rather than `keep` when stripping is off, because that is Cloudflare's own
  // default and keeping full EXIF is a privacy decision nobody asked for here.
  parts.push(config.stripMetadata ? 'metadata=none' : 'metadata=copyright')

  return parts.join(',')
}

/**
 * Rewrites a same-zone URL through Cloudflare Image Resizing.
 *
 * The original stays where it is in R2 and keeps being served from the same
 * path; `/cdn-cgi/image/<options>` in front of it is intercepted at the edge.
 * Relative URLs are kept relative so the same markup works on every preview and
 * production hostname.
 */
function resizingUrl(source: string, params: string): string {
  if (source.startsWith('/')) return `${RESIZING_SEGMENT.slice(0, -1)}/${params}${source}`

  try {
    const parsed = new URL(source)
    return `${parsed.origin}${RESIZING_SEGMENT}${params}${parsed.pathname}${parsed.search}`
  } catch {
    // Not a URL we can take apart - hand it back untouched rather than emit
    // something broken.
    return source
  }
}

/**
 * Builds the delivery URL for one image at one width.
 *
 * Falls back to the stored R2 URL whenever the configured provider cannot
 * actually serve this record. That fallback is the point: a half-filled
 * settings screen must never turn into missing images on the live site.
 */
export function buildImageUrl(
  media: MediaLike,
  config: MediaConfig,
  request: ImageRequest = {},
): string {
  const source = media.url ?? ''

  if (!source) return source
  if (!config.enabled) return source
  if (!isTransformable(media)) return source
  if (source.includes(RESIZING_SEGMENT)) return source

  const params = buildTransformParams(config, request)

  if (config.provider === 'cloudflare-resizing') {
    return resizingUrl(source, params)
  }

  if (config.provider === 'cloudflare-images') {
    // Cloudflare Images serves from its own storage, keyed by an id it hands
    // back at upload time. Without that id there is nothing at the delivery
    // address to serve, so an un-mirrored record keeps its R2 URL.
    if (!media.cloudflareImageId || !config.deliveryPrefix) return source
    return `${config.deliveryPrefix}/${media.cloudflareImageId}/${params}`
  }

  return source
}

/**
 * The candidate widths for a srcset: the configured responsive widths, capped
 * at the max width and at the original's own width. Offering a browser a 2560px
 * candidate for an 800px original wastes a request on an upscale.
 */
export function candidateWidths(media: MediaLike, config: MediaConfig): number[] {
  if (!config.enabled || config.responsiveWidths.length === 0) return []

  const ceiling = Math.min(config.maxWidth, media.width || config.maxWidth)
  const widths = config.responsiveWidths.filter((width) => width <= ceiling)

  // Keep the ceiling itself as a candidate so the largest screens are not
  // stuck with the next size down.
  if (widths.length === 0 || Math.max(...widths) < ceiling) widths.push(ceiling)

  return Array.from(new Set(widths)).sort((a, b) => a - b)
}

/** `undefined` rather than an empty string, so callers can spread it away. */
export function buildSrcSet(
  media: MediaLike,
  config: MediaConfig,
  request: ImageRequest = {},
): string | undefined {
  if (!media.url || !isTransformable(media)) return undefined

  const widths = candidateWidths(media, config)
  if (widths.length < 2) return undefined

  return widths
    .map((width) => `${buildImageUrl(media, config, { ...request, width })} ${width}w`)
    .join(', ')
}

/**
 * Height that matches the width being requested, so the browser can reserve the
 * right box before the bytes arrive. Without both attributes the page reflows
 * as images load, which is most of a bad CLS score.
 */
function intrinsicSize(
  media: MediaLike,
  config: MediaConfig,
  request: ImageRequest,
): { width?: number; height?: number } {
  const naturalWidth = media.width || undefined
  const naturalHeight = media.height || undefined

  if (!naturalWidth || !naturalHeight) return { width: request.width, height: request.height }

  const target = Math.min(request.width ?? naturalWidth, naturalWidth, config.enabled ? config.maxWidth : naturalWidth)
  return {
    width: Math.round(target),
    height: Math.round((naturalHeight / naturalWidth) * target),
  }
}

/**
 * One call, everything an <img> needs. Used by EngageImage and available on its
 * own for anywhere a component does not fit.
 */
export function resolveImage(
  media: MediaLike,
  config: MediaConfig,
  request: ImageRequest = {},
): ResolvedImage {
  const srcSet = buildSrcSet(media, config, request)
  const { width, height } = intrinsicSize(media, config, request)

  return {
    src: buildImageUrl(media, config, request),
    srcSet,
    // A srcset without sizes makes the browser assume 100vw and over-fetch on
    // every narrow layout, so a default is supplied rather than left off.
    sizes: srcSet ? (request.sizes ?? '100vw') : undefined,
    width,
    height,
    alt: media.alt ?? '',
    loading: request.priority ? 'eager' : 'lazy',
    decoding: request.priority ? 'sync' : 'async',
    fetchPriority: request.priority ? 'high' : undefined,
  }
}
